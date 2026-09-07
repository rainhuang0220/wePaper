from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from wepaper.server import _blob_path, create_app
from wepaper.settings import Settings


MINIMAL_PDF = b"""%PDF-1.1
1 0 obj<<>>endobj
trailer<<>>
%%EOF
"""


DESKTOP_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)
IPHONE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
)


def make_client(
    tmp_path: Path, token: str = "secret-token", owner_password: str = "owner-secret"
) -> TestClient:
    app = create_app(
        {
            "WEPAPER_DATA_DIR": str(tmp_path),
            "WEPAPER_SYNC_TOKEN": token,
            "WEPAPER_OWNER_PASSWORD": owner_password,
            "WEPAPER_MAX_UPLOAD_BYTES": str(2 * 1024 * 1024),
        }
    )
    return TestClient(app)


def auth(token: str = "secret-token") -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_robots_txt_is_plain_disallow(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    res = client.get("/robots.txt")
    assert res.status_code == 200
    assert "text/plain" in res.headers.get("content-type", "")
    assert "Disallow: /" in res.text
    assert not res.text.startswith('"')


def test_health_is_public(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_empty_library(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    res = client.get("/api/v1/papers")
    assert res.status_code == 200
    assert res.json()["papers"] == []


def test_openapi_is_disabled(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    assert client.get("/openapi.json").status_code == 404


def test_blob_path_rejects_escape(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path)
    settings.blob_dir.mkdir(parents=True, exist_ok=True)
    with pytest.raises(HTTPException):
        _blob_path(settings, "....pdf")
    with pytest.raises(HTTPException):
        _blob_path(settings, "../../../etc/passwd")
    key = "ab" * 32 + ".pdf"
    path = _blob_path(settings, key)
    assert path.resolve().is_relative_to(settings.blob_dir.resolve())


def test_write_requires_token(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    assert client.put("/api/v1/sync/papers", json={"zotero_item_key": "ABC12345", "title": "x"}).status_code == 401
    assert client.delete("/api/v1/sync/papers/ABC12345").status_code == 401
    assert client.get("/api/v1/sync/papers").status_code == 401
    assert client.get("/api/v1/sync/state").status_code == 401


def test_wrong_token_rejected(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    res = client.put(
        "/api/v1/sync/papers",
        headers=auth("nope"),
        json={"zotero_item_key": "ABC12345", "title": "x"},
    )
    assert res.status_code == 401


def test_wrong_length_token_is_401_not_500(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    res = client.put(
        "/api/v1/sync/papers",
        headers=auth("x"),
        json={"zotero_item_key": "ABC12345", "title": "x"},
    )
    assert res.status_code == 401
    assert "traceback" not in res.text.lower()


def _ingest_paper(client: TestClient, key: str = "C8TQ6QR5", title: str = "A-mem") -> None:
    res = client.put(
        "/api/v1/sync/papers",
        headers=auth(),
        json={
            "zotero_item_key": key,
            "title": title,
            "authors": "Wujiang Xu",
            "year": 2026,
            "venue": "NeurIPS",
            "doi": "10.52202/example",
            "abstract": "Memory for agents.",
            "tags": ["memory"],
            "collection": "Agent Memory",
            "visibility": "public",
            "zotero_version": 12,
        },
    )
    assert res.status_code in {200, 201}


def test_ingest_and_public_read(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _ingest_paper(client)
    listed = client.get("/api/v1/papers").json()["papers"]
    assert len(listed) == 1
    assert listed[0]["title"] == "A-mem"
    assert listed[0]["zotero_item_key"] == "C8TQ6QR5"
    detail = client.get("/api/v1/papers/C8TQ6QR5")
    assert detail.status_code == 200
    assert detail.json()["authors"] == "Wujiang Xu"


def test_upload_pdf_and_range(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _ingest_paper(client)
    upload = client.put(
        "/api/v1/sync/attachments/LCYIEFND",
        headers={**auth(), "X-Wepaper-Item-Key": "C8TQ6QR5", "X-Wepaper-Filename": "paper.pdf"},
        files={"file": ("paper.pdf", MINIMAL_PDF, "application/pdf")},
    )
    assert upload.status_code in {200, 201}
    first = client.get("/api/v1/papers/C8TQ6QR5/pdf")
    assert first.status_code == 200
    assert first.content.startswith(b"%PDF")
    alias = client.get("/paper/C8TQ6QR5/pdf")
    assert alias.status_code == 200
    assert alias.headers["content-type"].startswith("application/pdf")
    assert alias.content.startswith(b"%PDF")
    cache = alias.headers.get("cache-control", "")
    assert "no-store" not in cache
    assert "max-age" in cache
    head = client.head("/paper/C8TQ6QR5/pdf")
    assert head.status_code == 200
    assert head.headers["content-type"].startswith("application/pdf")
    assert int(head.headers["content-length"]) == len(alias.content)
    assert head.headers.get("accept-ranges") == "bytes"
    etag = alias.headers["etag"]
    cached = client.get("/paper/C8TQ6QR5/pdf", headers={"If-None-Match": etag})
    assert cached.status_code == 304
    public = client.get("/api/v1/papers/C8TQ6QR5").json()
    assert all("checksum" not in att for att in public["attachments"])
    assert all("zotero_attachment_key" not in att for att in public["attachments"])
    ranged = client.get("/api/v1/papers/C8TQ6QR5/pdf", headers={"Range": "bytes=0-3"})
    assert ranged.status_code == 206
    assert ranged.content == b"%PDF"
    alias_range = client.get("/paper/C8TQ6QR5/pdf", headers={"Range": "bytes=0-3"})
    assert alias_range.status_code == 206
    assert alias_range.content == b"%PDF"
    assert alias_range.headers["content-type"].startswith("application/pdf")


def _upload_pdf(client: TestClient, item_key: str = "C8TQ6QR5") -> None:
    upload = client.put(
        "/api/v1/sync/attachments/LCYIEFND",
        headers={**auth(), "X-Wepaper-Item-Key": item_key, "X-Wepaper-Filename": "paper.pdf"},
        files={"file": ("paper.pdf", MINIMAL_PDF, "application/pdf")},
    )
    assert upload.status_code in {200, 201}


def _assert_device_routing_headers(res) -> None:
    cache = res.headers.get("cache-control", "").lower()
    vary = res.headers.get("vary", "").lower()
    assert "no-store" in cache
    assert "sec-ch-ua-mobile" in vary
    assert "user-agent" in vary


def test_paper_html_route_redirects_desktop_to_native_pdf(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _ingest_paper(client)
    _upload_pdf(client)

    redirect = client.get("/paper/C8TQ6QR5", headers={"User-Agent": DESKTOP_UA}, follow_redirects=False)
    assert redirect.status_code == 302
    assert redirect.headers["location"].endswith("/paper/C8TQ6QR5/pdf")
    _assert_device_routing_headers(redirect)

    head = client.head("/paper/C8TQ6QR5", headers={"User-Agent": DESKTOP_UA}, follow_redirects=False)
    assert head.status_code == 302
    assert head.headers["location"].endswith("/paper/C8TQ6QR5/pdf")
    _assert_device_routing_headers(head)

    followed = client.get("/paper/C8TQ6QR5", headers={"User-Agent": DESKTOP_UA}, follow_redirects=True)
    assert followed.status_code == 200
    assert followed.headers["content-type"].startswith("application/pdf")
    assert followed.content.startswith(b"%PDF")

    missing = client.get("/paper/ZZZZZZZZ", headers={"User-Agent": DESKTOP_UA}, follow_redirects=False)
    assert missing.status_code == 404

    invalid = client.get("/paper/not-a-key", follow_redirects=False)
    assert invalid.status_code == 404


ANDROID_UA = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
)


def test_paper_html_route_redirects_mobile_to_native_pdf(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _ingest_paper(client)
    _upload_pdf(client)

    for headers in (
        {"User-Agent": IPHONE_UA},
        {"User-Agent": ANDROID_UA},
        {"User-Agent": DESKTOP_UA, "Sec-CH-UA-Mobile": "?1"},
    ):
        mobile = client.get("/paper/C8TQ6QR5", headers=headers, follow_redirects=False)
        assert mobile.status_code == 302
        assert mobile.headers["location"].endswith("/paper/C8TQ6QR5/pdf")
        _assert_device_routing_headers(mobile)
        assert "text/html" not in mobile.headers.get("content-type", "")
        assert not mobile.content.startswith(b"%PDF")

    followed = client.get("/paper/C8TQ6QR5", headers={"User-Agent": ANDROID_UA}, follow_redirects=True)
    assert followed.status_code == 200
    assert followed.headers["content-type"].startswith("application/pdf")
    assert followed.content.startswith(b"%PDF")

    explicit = client.get("/paper/C8TQ6QR5/viewer", headers={"User-Agent": ANDROID_UA}, follow_redirects=False)
    assert explicit.status_code == 200
    assert "text/html" in explicit.headers.get("content-type", "")

    raw = client.get("/paper/C8TQ6QR5/pdf", headers={"User-Agent": IPHONE_UA})
    assert raw.status_code == 200
    assert raw.headers["content-type"].startswith("application/pdf")
    assert raw.content.startswith(b"%PDF")
    assert "no-store" not in raw.headers.get("cache-control", "")


def test_reading_status_default_null_and_public_read(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _ingest_paper(client)
    listed = client.get("/api/v1/papers").json()["papers"][0]
    assert listed["reading_status"] is None
    detail = client.get("/api/v1/papers/C8TQ6QR5").json()
    assert detail["reading_status"] is None


def test_visitor_can_set_clear_and_filter_reading_status(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _ingest_paper(client, key="C8TQ6QR5", title="A-mem")
    _ingest_paper(client, key="BBBBBBBB", title="Other")

    for value in (
        "pending_browse",
        "pending_deep",
        "browsing",
        "deep_reading",
        "browsed",
        "deep_read",
    ):
        res = client.patch("/api/v1/papers/C8TQ6QR5/status", json={"reading_status": value})
        assert res.status_code == 200
        assert res.json()["reading_status"] == value
        assert client.get("/api/v1/papers/C8TQ6QR5").json()["reading_status"] == value

    assert client.patch("/api/v1/papers/C8TQ6QR5/status", json={"reading_status": "Exploring"}).status_code == 422
    cleared = client.patch("/api/v1/papers/C8TQ6QR5/status", json={"reading_status": None})
    assert cleared.status_code == 200
    assert cleared.json()["reading_status"] is None

    client.patch("/api/v1/papers/C8TQ6QR5/status", json={"reading_status": "pending_deep"})
    client.patch("/api/v1/papers/BBBBBBBB/status", json={"reading_status": "browsed"})
    found = client.get("/api/v1/papers", params={"reading_status": "pending_deep"}).json()["papers"]
    assert [p["zotero_item_key"] for p in found] == ["C8TQ6QR5"]
    unread = client.get("/api/v1/papers", params={"reading_status": "unread"}).json()["papers"]
    assert [p["zotero_item_key"] for p in unread] == ["C8TQ6QR5"]
    searched = client.get("/api/v1/papers", params={"q": "mem", "reading_status": "pending_deep"}).json()["papers"]
    assert [p["zotero_item_key"] for p in searched] == ["C8TQ6QR5"]
    empty = client.get("/api/v1/papers", params={"q": "other", "reading_status": "pending_deep"}).json()["papers"]
    assert empty == []


def test_status_write_does_not_require_owner_or_sync_token(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _ingest_paper(client)
    res = client.patch("/api/v1/papers/C8TQ6QR5/status", json={"reading_status": "browsing"})
    assert res.status_code == 200
    assert res.json()["reading_status"] == "browsing"
    assert client.get("/api/v1/owner/login").status_code == 404


def test_duplicate_upload_is_idempotent(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _ingest_paper(client)
    for _ in range(2):
        res = client.put(
            "/api/v1/sync/attachments/LCYIEFND",
            headers={**auth(), "X-Wepaper-Item-Key": "C8TQ6QR5", "X-Wepaper-Filename": "paper.pdf"},
            files={"file": ("paper.pdf", MINIMAL_PDF, "application/pdf")},
        )
        assert res.status_code in {200, 201}
    blobs = list((tmp_path / "blobs").rglob("*.pdf"))
    assert len(blobs) == 1


def test_rejects_oversize_pdf(tmp_path: Path) -> None:
    app = create_app(
        {
            "WEPAPER_DATA_DIR": str(tmp_path),
            "WEPAPER_SYNC_TOKEN": "secret-token",
            "WEPAPER_MAX_UPLOAD_BYTES": "20",
        }
    )
    client = TestClient(app)
    _ingest_paper(client)
    fat = b"%PDF-1.1\n" + b"x" * 80
    res = client.put(
        "/api/v1/sync/attachments/LCYIEFND",
        headers={**auth(), "X-Wepaper-Item-Key": "C8TQ6QR5", "X-Wepaper-Filename": "paper.pdf"},
        files={"file": ("paper.pdf", fat, "application/pdf")},
    )
    assert res.status_code == 413


def test_reject_non_pdf_and_path_id(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _ingest_paper(client)
    exe = client.put(
        "/api/v1/sync/attachments/BADFILE1",
        headers={**auth(), "X-Wepaper-Item-Key": "C8TQ6QR5", "X-Wepaper-Filename": "x.exe"},
        files={"file": ("x.exe", b"MZ\x90\x00not-a-pdf", "application/octet-stream")},
    )
    assert exe.status_code == 415
    assert client.get("/api/v1/papers/../etc/passwd").status_code in {400, 404, 422}


def test_search_and_hide(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _ingest_paper(client, key="AAAAAAAA", title="Mandol memory system")
    _ingest_paper(client, key="BBBBBBBB", title="U-mamba biomedical")
    found = client.get("/api/v1/papers", params={"q": "mandol"}).json()["papers"]
    assert [p["zotero_item_key"] for p in found] == ["AAAAAAAA"]
    hide = client.post("/api/v1/sync/papers/AAAAAAAA/hide", headers=auth())
    assert hide.status_code == 200
    remaining = client.get("/api/v1/papers").json()["papers"]
    assert [p["zotero_item_key"] for p in remaining] == ["BBBBBBBB"]
    client.put(
        "/api/v1/sync/attachments/ATT0000A",
        headers={**auth(), "X-Wepaper-Item-Key": "AAAAAAAA", "X-Wepaper-Filename": "paper.pdf"},
        files={"file": ("paper.pdf", MINIMAL_PDF, "application/pdf")},
    )
    assert client.get("/api/v1/papers/AAAAAAAA/pdf").status_code == 404
    assert client.get("/api/v1/papers/AAAAAAAA").status_code == 404


def test_private_visibility_hides_pdf(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    res = client.put(
        "/api/v1/sync/papers",
        headers=auth(),
        json={
            "zotero_item_key": "PRIV0001",
            "title": "Secret preprint",
            "visibility": "private",
        },
    )
    assert res.status_code == 200
    client.put(
        "/api/v1/sync/attachments/PRIVATT1",
        headers={**auth(), "X-Wepaper-Item-Key": "PRIV0001", "X-Wepaper-Filename": "paper.pdf"},
        files={"file": ("paper.pdf", MINIMAL_PDF, "application/pdf")},
    )
    assert client.get("/api/v1/papers").json()["papers"] == []
    assert client.get("/api/v1/papers/PRIV0001").status_code == 404
    assert client.get("/api/v1/papers/PRIV0001/pdf").status_code == 404


def test_security_headers_and_docs_are_closed(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    home = client.get("/")
    csp = home.headers.get("content-security-policy", "")
    assert "frame-ancestors 'none'" in csp
    assert "object-src 'none'" in csp
    assert "fonts.googleapis.com" not in csp
    assert home.headers.get("x-frame-options") == "DENY"
    assert client.get("/openapi.json").status_code == 404
    assert client.get("/docs").status_code == 404
    assert client.get("/redoc").status_code == 404


def test_chinese_title_roundtrip(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _ingest_paper(client, key="ZHCN0001", title="基于长上下文的智能体记忆")
    listed = client.get("/api/v1/papers", params={"q": "智能体"}).json()["papers"]
    assert listed[0]["title"] == "基于长上下文的智能体记忆"


def test_paper_comments_replies_likes_and_catalog_counts(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _ingest_paper(client, key="C8TQ6QR5", title="A-mem")
    _ingest_paper(client, key="BBBBBBBB", title="Other")

    empty = client.get("/api/v1/papers/C8TQ6QR5/comments")
    assert empty.status_code == 200
    assert empty.json() == {"comments": []}
    listed = client.get("/api/v1/papers").json()["papers"]
    assert {row["zotero_item_key"]: row["comment_count"] for row in listed} == {
        "C8TQ6QR5": 0,
        "BBBBBBBB": 0,
    }

    created = client.post(
        "/api/v1/papers/C8TQ6QR5/comments",
        json={"body": "  这篇的记忆承诺实验值得对照。  ", "display_name": " Ada "},
    )
    assert created.status_code == 201
    comment = created.json()
    assert comment["body"] == "这篇的记忆承诺实验值得对照。"
    assert comment["display_name"] == "Ada"
    assert comment["parent_id"] is None
    assert comment["like_count"] == 0

    assert client.post("/api/v1/papers/C8TQ6QR5/comments", json={"body": "   "}).status_code == 422
    assert client.post("/api/v1/papers/C8TQ6QR5/comments", json={"body": "<script>x</script>"}).status_code == 201

    reply = client.post(
        f"/api/v1/comments/{comment['id']}/replies",
        json={"body": "同意，尤其是 verify 条件。"},
    )
    assert reply.status_code == 201
    assert reply.json()["parent_id"] == comment["id"]
    nested = client.post(
        f"/api/v1/comments/{reply.json()['id']}/replies",
        json={"body": "too deep"},
    )
    assert nested.status_code == 422

    liked = client.post(f"/api/v1/comments/{comment['id']}/like")
    assert liked.status_code == 200
    assert liked.json()["like_count"] == 1

    thread = client.get("/api/v1/papers/C8TQ6QR5/comments").json()["comments"]
    by_id = {item["id"]: item for item in thread}
    assert comment["id"] in by_id
    assert by_id[comment["id"]]["like_count"] == 1
    assert [item["body"] for item in by_id[comment["id"]]["replies"]] == ["同意，尤其是 verify 条件。"]
    assert any(item["body"] == "<script>x</script>" for item in thread)

    catalog = client.get("/api/v1/papers").json()["papers"]
    counts = {row["zotero_item_key"]: row["comment_count"] for row in catalog}
    assert counts["C8TQ6QR5"] == 3
    assert counts["BBBBBBBB"] == 0

    discussion = client.get("/paper/C8TQ6QR5/discussion", follow_redirects=False)
    assert discussion.status_code == 200
    assert "text/html" in discussion.headers.get("content-type", "")


def test_concurrent_paper_and_comment_reads_do_not_crash_sqlite(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _ingest_paper(client)
    client.post("/api/v1/papers/C8TQ6QR5/comments", json={"body": "hello"})

    def read_paper() -> int:
        return client.get("/api/v1/papers/C8TQ6QR5").status_code

    def read_comments() -> int:
        return client.get("/api/v1/papers/C8TQ6QR5/comments").status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        jobs = [pool.submit(read_paper) for _ in range(8)] + [pool.submit(read_comments) for _ in range(8)]
        codes = [job.result() for job in jobs]
    assert codes == [200] * 16


def test_hidden_paper_keeps_comments_until_it_reappears(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _ingest_paper(client, key="C8TQ6QR5", title="A-mem")
    created = client.post("/api/v1/papers/C8TQ6QR5/comments", json={"body": "keep me"})
    assert created.status_code == 201
    assert client.post("/api/v1/sync/papers/C8TQ6QR5/hide", headers=auth()).status_code == 200
    assert client.get("/api/v1/papers/C8TQ6QR5/comments").status_code == 404
    assert client.post("/api/v1/papers/C8TQ6QR5/comments", json={"body": "nope"}).status_code == 404
    _ingest_paper(client, key="C8TQ6QR5", title="A-mem")
    thread = client.get("/api/v1/papers/C8TQ6QR5/comments").json()["comments"]
    assert [item["body"] for item in thread] == ["keep me"]
