from __future__ import annotations

import hashlib
import json
import logging
import mimetypes
import re
import secrets
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from wepaper.checksum import sha256_bytes, verify_checksum
from wepaper.comments import comment_payload, new_comment_id, parse_comment_body, parse_display_name
from wepaper.db import connect, migrate, utcnow
from wepaper.linearize import ensure_linearized, linearized_path
from wepaper.reading_status import filter_values, parse_reading_status
from wepaper.sanitize import safe_storage_name, sanitize_filename
from wepaper.settings import Settings

DEVICE_ROUTE_HEADERS = {
    "Cache-Control": "private, no-store",
    "Vary": "Sec-CH-UA-Mobile, User-Agent",
    "Accept-CH": "Sec-CH-UA-Mobile",
}

log = logging.getLogger("wepaper")
ITEM_KEY = re.compile(r"^[A-Za-z0-9]{8}$")
mimetypes.add_type("application/javascript", ".mjs")
PDF_MAGIC = b"%PDF"


def load_settings(overrides: dict[str, str] | None = None) -> Settings:
    if not overrides:
        return Settings()
    mapped: dict[str, Any] = {}
    for key, value in overrides.items():
        mapped[key.removeprefix("WEPAPER_").lower()] = value
    return Settings(**mapped)


def valid_item_key(key: str) -> str:
    if not ITEM_KEY.fullmatch(key or ""):
        raise HTTPException(status_code=404, detail="unknown paper")
    return key.upper() if key.isupper() or key.isalnum() else key


class PaperIn(BaseModel):
    zotero_item_key: str = Field(min_length=8, max_length=8, pattern=r"^[A-Za-z0-9]{8}$")
    title: str = Field(min_length=1, max_length=2000)
    authors: str = Field(default="", max_length=4000)
    year: int | None = None
    venue: str | None = Field(default=None, max_length=500)
    doi: str | None = Field(default=None, max_length=200)
    abstract: str | None = Field(default=None, max_length=20000)
    tags: list[str] = Field(default_factory=list, max_length=32)
    collection: str = Field(default="", max_length=200)
    date_added: str | None = Field(default=None, max_length=40)
    date_modified: str | None = Field(default=None, max_length=40)
    visibility: str = "public"
    zotero_version: int = 0


class SyncStateIn(BaseModel):
    library_version: int
    zotero_server_id: str | None = None


class StatusIn(BaseModel):
    reading_status: str | None = None


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    display_name: str | None = Field(default=None, max_length=80)


def create_app(overrides: dict[str, str] | None = None) -> FastAPI:
    settings = load_settings(overrides)
    settings.data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    settings.blob_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    for locked in (settings.data_dir, settings.blob_dir):
        try:
            locked.chmod(0o700)
        except OSError:
            pass
    conn = connect(settings.db_path)
    migrate(conn)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        conn.close()

    app = FastAPI(
        title="wePaper",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.public_url],
        allow_methods=["GET", "HEAD", "OPTIONS", "PATCH", "POST"],
        allow_headers=["Range", "Authorization", "Content-Type"],
        allow_credentials=True,
    )
    app.state.settings = settings
    app.state.db = conn

    def db() -> sqlite3.Connection:
        return conn

    def require_sync(request: Request) -> None:
        token = settings.sync_token
        header = request.headers.get("authorization", "")
        if not token or not header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="unauthorized")
        provided = header.removeprefix("Bearer ").strip()
        provided_digest = hashlib.sha256(provided.encode()).digest()
        expected_digest = hashlib.sha256(token.encode()).digest()
        if not secrets.compare_digest(provided_digest, expected_digest):
            raise HTTPException(status_code=401, detail="unauthorized")

    def spa_html(headers: dict[str, str] | None = None, preload_viewer: bool = False) -> FileResponse | HTMLResponse:
        extra = {**DEVICE_ROUTE_HEADERS, **(headers or {})}
        index = settings.web_dir / "index.html"
        if not index.is_file():
            return HTMLResponse("<!doctype html><title>wePaper</title><div id='root'></div>", headers=extra)
        html = index.read_text(encoding="utf-8")
        assets = settings.web_dir / "assets"
        preloads: list[str] = []
        if preload_viewer and assets.is_dir():
            paper_js = next(iter(sorted(assets.glob("PaperPage-*.js"))), None)
            if paper_js:
                preloads.append(f'<link rel="modulepreload" href="/assets/{paper_js.name}" />')
            worker = next(iter(sorted(assets.glob("pdf.worker*.mjs"))), None)
            if worker:
                preloads.append(
                    f'<link rel="preload" href="/assets/{worker.name}" as="script" crossorigin />'
                )
            css = next(iter(sorted(assets.glob("PaperPage-*.css"))), None)
            if css:
                preloads.append(f'<link rel="stylesheet" href="/assets/{css.name}" />')
        if preloads and "</head>" in html:
            html = html.replace("</head>", f"    {''.join(preloads)}\n  </head>")
        return HTMLResponse(html, media_type="text/html", headers=extra)

    @app.exception_handler(Exception)
    async def hide_stack(request: Request, exc: Exception):
        if isinstance(exc, HTTPException):
            return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
        log.exception("unhandled error on %s", request.url.path)
        return JSONResponse({"detail": "internal error"}, status_code=500)

    @app.get("/api/v1/health")
    def health() -> dict[str, str]:
        conn.execute("SELECT 1")
        return {"status": "ok"}

    @app.get("/api/v1/papers")
    def list_papers(
        q: str | None = None,
        collection: str | None = None,
        reading_status: str | None = None,
        sort: str = "added",
        limit: int = Query(default=50, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
    ) -> dict[str, Any]:
        where = ["hidden = 0", "tombstoned = 0", "visibility = 'public'"]
        args: list[Any] = []
        if collection:
            where.append("collection = ?")
            args.append(collection)
        if reading_status:
            try:
                wanted = filter_values(reading_status)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail="invalid reading status") from exc
            if wanted:
                where.append(f"reading_status IN ({','.join('?' * len(wanted))})")
                args.extend(wanted)
        if q:
            where.append("(title LIKE ? OR authors LIKE ? OR venue LIKE ? OR tags_json LIKE ?)")
            like = f"%{q}%"
            args.extend([like, like, like, like])
        order = {
            "added": "datetime(COALESCE(date_added, created_at)) DESC",
            "year": "year DESC, title COLLATE NOCASE",
            "title": "title COLLATE NOCASE",
        }.get(sort, "datetime(COALESCE(date_added, created_at)) DESC")
        sql = f"SELECT * FROM papers WHERE {' AND '.join(where)} ORDER BY {order} LIMIT ? OFFSET ?"
        rows = conn.execute(sql, [*args, limit, offset]).fetchall()
        total = conn.execute(
            f"SELECT COUNT(*) FROM papers WHERE {' AND '.join(where)}", args
        ).fetchone()[0]
        counts = _comment_counts(conn, [row["zotero_item_key"] for row in rows])
        return {
            "papers": [
                _paper_json(conn, row, comment_count=counts.get(row["zotero_item_key"], 0))
                for row in rows
            ],
            "total": total,
        }

    @app.get("/api/v1/papers/{item_key}")
    def get_paper(item_key: str) -> dict[str, Any]:
        key = _public_key(item_key)
        row = conn.execute(
            "SELECT * FROM papers WHERE zotero_item_key = ? AND hidden = 0 AND tombstoned = 0 AND visibility = 'public'",
            (key,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="not found")
        counts = _comment_counts(conn, [key])
        return _paper_json(conn, row, include_abstract=True, comment_count=counts.get(key, 0))

    def _pdf_file(item_key: str) -> tuple[sqlite3.Row, Path]:
        key = _public_key(item_key)
        att = conn.execute(
            """
            SELECT a.* FROM attachments a
            JOIN papers p ON p.zotero_item_key = a.paper_key
            WHERE a.paper_key = ? AND p.hidden = 0 AND p.tombstoned = 0 AND p.visibility = 'public'
            ORDER BY a.created_at ASC
            LIMIT 1
            """,
            (key,),
        ).fetchone()
        if att is None:
            raise HTTPException(status_code=404, detail="pdf not found")
        path = _blob_path(settings, att["storage_key"])
        if not path.is_file():
            raise HTTPException(status_code=404, detail="pdf missing")
        return att, path

    def _pdf_headers(att: sqlite3.Row) -> dict[str, str]:
        return {
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
            "Accept-Ranges": "bytes",
            "ETag": f'"{att["checksum"]}"',
            "Content-Disposition": f'inline; filename="{sanitize_filename(att["filename"])}"',
        }

    def _serve_pdf(att: sqlite3.Row, path: Path) -> Path:
        derived = ensure_linearized(path, linearized_path(settings, att["storage_key"]))
        return derived or path

    @app.api_route("/api/v1/papers/{item_key}/pdf", methods=["GET", "HEAD"], response_model=None)
    def get_pdf(item_key: str, request: Request) -> FileResponse | Response:
        att, path = _pdf_file(item_key)
        headers = _pdf_headers(att)
        etag = headers["ETag"]
        matched = request.headers.get("if-none-match", "").strip()
        if matched in {etag, f"W/{etag}"}:
            return Response(status_code=304, headers={"ETag": etag, "Cache-Control": headers["Cache-Control"]})
        path = _serve_pdf(att, path)
        if request.method == "HEAD":
            headers["Content-Length"] = str(path.stat().st_size)
            return Response(status_code=200, media_type="application/pdf", headers=headers)
        return FileResponse(
            path,
            media_type="application/pdf",
            filename=sanitize_filename(att["filename"]),
            content_disposition_type="inline",
            headers=headers,
        )

    @app.api_route("/paper/{item_key}/pdf", methods=["GET", "HEAD"], response_model=None)
    def public_pdf(item_key: str, request: Request) -> FileResponse | Response:
        return get_pdf(item_key, request)

    @app.api_route("/paper/{item_key}/viewer", methods=["GET", "HEAD"], response_model=None)
    def public_paper_viewer(item_key: str) -> Response:
        key = _public_key(item_key)
        row = conn.execute(
            "SELECT 1 FROM papers WHERE zotero_item_key = ? AND hidden = 0 AND tombstoned = 0 AND visibility = 'public'",
            (key,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="not found")
        return spa_html(preload_viewer=True)

    @app.api_route("/paper/{item_key}", methods=["GET", "HEAD"], response_model=None)
    def public_paper(item_key: str, request: Request) -> Response:
        key = _public_key(item_key)
        row = conn.execute(
            "SELECT 1 FROM papers WHERE zotero_item_key = ? AND hidden = 0 AND tombstoned = 0 AND visibility = 'public'",
            (key,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="not found")
        # Recovery: every client, including Android, gets raw PDF. The HTML
        # mobile viewer stays available only at /paper/:id/viewer for local
        # investigation. Do not serve it as the default reading path.
        return RedirectResponse(url=f"/paper/{key}/pdf", status_code=302, headers=DEVICE_ROUTE_HEADERS)

    @app.api_route("/paper/{item_key}/discussion", methods=["GET", "HEAD"], response_model=None)
    def public_discussion(item_key: str) -> Response:
        key = _public_key(item_key)
        row = conn.execute(
            "SELECT 1 FROM papers WHERE zotero_item_key = ? AND hidden = 0 AND tombstoned = 0 AND visibility = 'public'",
            (key,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="not found")
        return spa_html()

    @app.patch("/api/v1/papers/{item_key}/status")
    def patch_paper_status(item_key: str, body: StatusIn) -> dict[str, Any]:
        try:
            status = parse_reading_status(body.reading_status)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="invalid reading status") from exc
        key = _public_key(item_key)
        row = conn.execute(
            "SELECT * FROM papers WHERE zotero_item_key = ? AND hidden = 0 AND tombstoned = 0 AND visibility = 'public'",
            (key,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="not found")
        conn.execute(
            "UPDATE papers SET reading_status = ?, updated_at = ? WHERE zotero_item_key = ?",
            (status, utcnow(), key),
        )
        conn.commit()
        updated = conn.execute("SELECT * FROM papers WHERE zotero_item_key = ?", (key,)).fetchone()
        counts = _comment_counts(conn, [key])
        return _paper_json(conn, updated, comment_count=counts.get(key, 0))

    def _public_paper_row(item_key: str) -> sqlite3.Row:
        key = _public_key(item_key)
        row = conn.execute(
            "SELECT * FROM papers WHERE zotero_item_key = ? AND hidden = 0 AND tombstoned = 0 AND visibility = 'public'",
            (key,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="not found")
        return row

    def _insert_comment(paper_id: str, parent_id: str | None, body: CommentIn) -> dict[str, Any]:
        try:
            text = parse_comment_body(body.body)
            name = parse_display_name(body.display_name)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        comment_id = new_comment_id()
        now = utcnow()
        conn.execute(
            """
            INSERT INTO paper_comments(id, paper_id, parent_id, body, display_name, like_count, created_at)
            VALUES (?, ?, ?, ?, ?, 0, ?)
            """,
            (comment_id, paper_id, parent_id, text, name, now),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM paper_comments WHERE id = ?", (comment_id,)).fetchone()
        return comment_payload(row)

    @app.get("/api/v1/papers/{item_key}/comments")
    def list_comments(item_key: str) -> dict[str, Any]:
        paper = _public_paper_row(item_key)
        rows = conn.execute(
            "SELECT * FROM paper_comments WHERE paper_id = ? ORDER BY created_at ASC",
            (paper["zotero_item_key"],),
        ).fetchall()
        return {"comments": _thread_comments(rows)}

    @app.post("/api/v1/papers/{item_key}/comments")
    def create_comment(item_key: str, body: CommentIn) -> JSONResponse:
        paper = _public_paper_row(item_key)
        payload = _insert_comment(paper["zotero_item_key"], None, body)
        return JSONResponse(payload, status_code=201)

    @app.post("/api/v1/comments/{comment_id}/replies")
    def create_reply(comment_id: str, body: CommentIn) -> JSONResponse:
        parent = conn.execute("SELECT * FROM paper_comments WHERE id = ?", (comment_id,)).fetchone()
        if parent is None:
            raise HTTPException(status_code=404, detail="not found")
        if parent["parent_id"]:
            raise HTTPException(status_code=422, detail="reply depth exceeded")
        _public_paper_row(parent["paper_id"])
        payload = _insert_comment(parent["paper_id"], parent["id"], body)
        return JSONResponse(payload, status_code=201)

    @app.post("/api/v1/comments/{comment_id}/like")
    def like_comment(comment_id: str) -> dict[str, Any]:
        row = conn.execute("SELECT * FROM paper_comments WHERE id = ?", (comment_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="not found")
        _public_paper_row(row["paper_id"])
        conn.execute(
            "UPDATE paper_comments SET like_count = like_count + 1 WHERE id = ?",
            (comment_id,),
        )
        conn.commit()
        updated = conn.execute("SELECT * FROM paper_comments WHERE id = ?", (comment_id,)).fetchone()
        return {"id": updated["id"], "like_count": int(updated["like_count"])}

    @app.put("/api/v1/sync/papers")
    def upsert_paper(body: PaperIn, _: None = Depends(require_sync)) -> dict[str, str]:
        now = utcnow()
        existing = conn.execute(
            "SELECT created_at FROM papers WHERE zotero_item_key = ?", (body.zotero_item_key,)
        ).fetchone()
        visibility = body.visibility if body.visibility in {"public", "unlisted", "private"} else "public"
        conn.execute(
            """
            INSERT INTO papers(
                zotero_item_key, title, authors, year, venue, doi, abstract, tags_json,
                collection, date_added, date_modified, visibility, hidden, tombstoned,
                zotero_version, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
            ON CONFLICT(zotero_item_key) DO UPDATE SET
                title=excluded.title,
                authors=excluded.authors,
                year=excluded.year,
                venue=excluded.venue,
                doi=excluded.doi,
                abstract=excluded.abstract,
                tags_json=excluded.tags_json,
                collection=excluded.collection,
                date_added=excluded.date_added,
                date_modified=excluded.date_modified,
                visibility=excluded.visibility,
                hidden=0,
                tombstoned=0,
                zotero_version=excluded.zotero_version,
                updated_at=excluded.updated_at
            """,
            (
                body.zotero_item_key,
                body.title,
                body.authors,
                body.year,
                body.venue,
                body.doi,
                body.abstract,
                json.dumps(body.tags, ensure_ascii=False),
                body.collection,
                body.date_added,
                body.date_modified,
                visibility,
                body.zotero_version,
                existing["created_at"] if existing else now,
                now,
            ),
        )
        conn.commit()
        return {"status": "ok", "zotero_item_key": body.zotero_item_key}

    @app.put("/api/v1/sync/attachments/{attachment_key}")
    async def upsert_attachment(
        request: Request,
        attachment_key: str,
        file: UploadFile = File(...),
        x_wepaper_item_key: str = Header(),
        x_wepaper_filename: str = Header(default="paper.pdf"),
        x_wepaper_checksum: str | None = Header(default=None),
        _: None = Depends(require_sync),
    ) -> dict[str, str]:
        key = _public_key(attachment_key)
        paper_key = _public_key(x_wepaper_item_key)
        paper = conn.execute("SELECT 1 FROM papers WHERE zotero_item_key = ?", (paper_key,)).fetchone()
        if paper is None:
            raise HTTPException(status_code=404, detail="paper not found")
        declared = request.headers.get("content-length")
        if declared and declared.isdigit() and int(declared) > settings.max_upload_bytes + 65536:
            raise HTTPException(status_code=413, detail="file too large")
        chunks: list[bytes] = []
        received = 0
        while True:
            chunk = await file.read(65536)
            if not chunk:
                break
            received += len(chunk)
            if received > settings.max_upload_bytes:
                raise HTTPException(status_code=413, detail="file too large")
            chunks.append(chunk)
        data = b"".join(chunks)
        if not data.startswith(PDF_MAGIC):
            raise HTTPException(status_code=415, detail="not a pdf")
        filename = sanitize_filename(x_wepaper_filename or file.filename or "paper.pdf")
        if not filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=415, detail="not a pdf")
        checksum = sha256_bytes(data)
        if x_wepaper_checksum and not verify_checksum(data, x_wepaper_checksum):
            raise HTTPException(status_code=422, detail="checksum mismatch")
        storage_key = safe_storage_name(checksum, filename)
        dest = _blob_path(settings, storage_key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists():
            tmp = dest.with_name(dest.name + ".partial")
            tmp.write_bytes(data)
            tmp.replace(dest)
        ensure_linearized(dest, linearized_path(settings, storage_key))
        conn.execute(
            """
            INSERT INTO attachments(
                zotero_attachment_key, paper_key, filename, mime, size, checksum, storage_key, mtime, created_at
            ) VALUES (?, ?, ?, 'application/pdf', ?, ?, ?, NULL, ?)
            ON CONFLICT(zotero_attachment_key) DO UPDATE SET
                paper_key=excluded.paper_key,
                filename=excluded.filename,
                size=excluded.size,
                checksum=excluded.checksum,
                storage_key=excluded.storage_key
            """,
            (key, paper_key, filename, len(data), checksum, storage_key, utcnow()),
        )
        conn.commit()
        return {"status": "ok", "checksum": checksum, "storage_key": storage_key}

    @app.post("/api/v1/sync/papers/{item_key}/hide")
    def hide_paper(item_key: str, _: None = Depends(require_sync)) -> dict[str, str]:
        key = _public_key(item_key)
        conn.execute(
            "UPDATE papers SET hidden = 1, updated_at = ? WHERE zotero_item_key = ?",
            (utcnow(), key),
        )
        conn.commit()
        return {"status": "hidden", "zotero_item_key": key}

    @app.delete("/api/v1/sync/papers/{item_key}")
    def tombstone_paper(item_key: str, _: None = Depends(require_sync)) -> dict[str, str]:
        key = _public_key(item_key)
        conn.execute(
            "UPDATE papers SET tombstoned = 1, hidden = 1, updated_at = ? WHERE zotero_item_key = ?",
            (utcnow(), key),
        )
        conn.commit()
        return {"status": "tombstoned", "zotero_item_key": key}

    @app.put("/api/v1/sync/state")
    def put_state(body: SyncStateIn, _: None = Depends(require_sync)) -> dict[str, Any]:
        now = utcnow()
        conn.execute(
            """
            UPDATE sync_state SET library_version = ?, zotero_server_id = ?, last_sync_at = ?, last_success_at = ?
            WHERE id = 1
            """,
            (body.library_version, body.zotero_server_id, now, now),
        )
        conn.commit()
        return {"status": "ok", "library_version": body.library_version}

    @app.get("/api/v1/sync/state")
    def get_state(_: None = Depends(require_sync)) -> dict[str, Any]:
        row = conn.execute("SELECT * FROM sync_state WHERE id = 1").fetchone()
        return dict(row)

    @app.get("/api/v1/sync/papers")
    def sync_list_papers(_: None = Depends(require_sync)) -> dict[str, Any]:
        rows = conn.execute("SELECT * FROM papers WHERE tombstoned = 0").fetchall()
        return {"papers": [_paper_json(conn, row, include_hidden=True) for row in rows]}

    @app.get("/robots.txt")
    def robots() -> PlainTextResponse:
        return PlainTextResponse("User-agent: *\nDisallow: /\n")

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "font-src 'self'; img-src 'self' data: blob:; worker-src 'self' blob:; "
            "connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
        )
        if request.url.path.startswith("/assets/"):
            response.headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")
        elif request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    if settings.web_dir.is_dir():
        assets = settings.web_dir / "assets"
        if assets.is_dir():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/{full_path:path}")
        def spa(full_path: str):
            if full_path.startswith("wepaper/"):
                full_path = full_path[8:]
            if full_path.startswith("api/") or full_path in {"openapi.json", "docs", "redoc"}:
                raise HTTPException(status_code=404, detail="not found")
            candidate = (settings.web_dir / full_path).resolve()
            try:
                candidate.relative_to(settings.web_dir.resolve())
            except ValueError:
                raise HTTPException(status_code=404, detail="not found") from None
            if full_path and candidate.is_file():
                return FileResponse(candidate)
            index = settings.web_dir / "index.html"
            if not index.is_file():
                raise HTTPException(status_code=404, detail="ui not built")
            return FileResponse(index)

    return app


def _public_key(key: str) -> str:
    if not ITEM_KEY.fullmatch(key or ""):
        raise HTTPException(status_code=404, detail="not found")
    return key


BLOB_KEY = re.compile(r"^[0-9a-f]{64}\.pdf$")


def _blob_path(settings: Settings, storage_key: str) -> Path:
    if not BLOB_KEY.fullmatch(storage_key or ""):
        raise HTTPException(status_code=400, detail="bad storage key")
    root = settings.blob_dir.resolve()
    path = (root / storage_key[:2] / storage_key[2:4] / storage_key).resolve()
    try:
        path.relative_to(root)
    except ValueError:
        raise HTTPException(status_code=400, detail="bad storage key") from None
    return path


def _comment_counts(conn: sqlite3.Connection, keys: list[str]) -> dict[str, int]:
    if not keys:
        return {}
    placeholders = ",".join("?" * len(keys))
    rows = conn.execute(
        f"SELECT paper_id, COUNT(*) FROM paper_comments WHERE paper_id IN ({placeholders}) GROUP BY paper_id",
        keys,
    ).fetchall()
    return {str(row[0]): int(row[1]) for row in rows}


def _thread_comments(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for row in rows:
        payload = comment_payload(row)
        by_id[payload["id"]] = payload
    tops: list[dict[str, Any]] = []
    for payload in by_id.values():
        parent_id = payload["parent_id"]
        if parent_id and parent_id in by_id:
            by_id[parent_id]["replies"].append(payload)
        elif not parent_id:
            tops.append(payload)
    return tops


def _paper_json(
    conn: sqlite3.Connection,
    row: sqlite3.Row,
    include_abstract: bool = False,
    include_hidden: bool = False,
    comment_count: int = 0,
) -> dict[str, Any]:
    atts = conn.execute(
        "SELECT zotero_attachment_key, filename, size, checksum FROM attachments WHERE paper_key = ?",
        (row["zotero_item_key"],),
    ).fetchall()
    payload = {
        "id": row["zotero_item_key"],
        "zotero_item_key": row["zotero_item_key"],
        "title": row["title"],
        "authors": row["authors"],
        "year": row["year"],
        "venue": row["venue"],
        "doi": row["doi"],
        "tags": json.loads(row["tags_json"] or "[]"),
        "collection": row["collection"],
        "date_added": row["date_added"] or row["created_at"],
        "visibility": row["visibility"],
        "has_pdf": bool(atts),
        "reading_status": row["reading_status"] if "reading_status" in row.keys() else None,
        "comment_count": comment_count,
        "attachments": (
            [dict(att) for att in atts]
            if include_hidden
            else [{"filename": att["filename"], "size": att["size"]} for att in atts]
        ),
    }
    if include_abstract:
        payload["abstract"] = row["abstract"]
    if include_hidden:
        payload["hidden"] = bool(row["hidden"])
        payload["tombstoned"] = bool(row["tombstoned"])
        payload["zotero_version"] = row["zotero_version"]
    return payload
