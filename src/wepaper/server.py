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
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from wepaper.checksum import sha256_bytes, verify_checksum
from wepaper.db import connect, migrate, utcnow
from wepaper.linearize import ensure_linearized, linearized_path
from wepaper.sanitize import safe_storage_name, sanitize_filename
from wepaper.settings import Settings

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
        allow_methods=["GET", "HEAD", "OPTIONS"],
        allow_headers=["Range", "Authorization"],
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
        sort: str = "added",
        limit: int = Query(default=50, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
    ) -> dict[str, Any]:
        where = ["hidden = 0", "tombstoned = 0", "visibility = 'public'"]
        args: list[Any] = []
        if collection:
            where.append("collection = ?")
            args.append(collection)
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
        return {"papers": [_paper_json(conn, row) for row in rows], "total": total}

    @app.get("/api/v1/papers/{item_key}")
    def get_paper(item_key: str) -> dict[str, Any]:
        key = _public_key(item_key)
        row = conn.execute(
            "SELECT * FROM papers WHERE zotero_item_key = ? AND hidden = 0 AND tombstoned = 0 AND visibility = 'public'",
            (key,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="not found")
        return _paper_json(conn, row, include_abstract=True)

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

    @app.api_route("/paper/{item_key}", methods=["GET", "HEAD"])
    def public_paper(item_key: str) -> RedirectResponse:
        key = _public_key(item_key)
        row = conn.execute(
            "SELECT 1 FROM papers WHERE zotero_item_key = ? AND hidden = 0 AND tombstoned = 0 AND visibility = 'public'",
            (key,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="not found")
        return RedirectResponse(url=f"/paper/{key}/pdf", status_code=302)

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


def _paper_json(
    conn: sqlite3.Connection, row: sqlite3.Row, include_abstract: bool = False, include_hidden: bool = False
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
