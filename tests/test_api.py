from pathlib import Path

from fastapi.testclient import TestClient

from wepaper.server import create_app


MINIMAL_PDF = b"""%PDF-1.1
1 0 obj<<>>endobj
trailer<<>>
%%EOF
"""


def make_client(tmp_path: Path, token: str = "secret-token") -> TestClient:
    app = create_app(
        {
            "WEPAPER_DATA_DIR": str(tmp_path),
            "WEPAPER_SYNC_TOKEN": token,
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


def test_write_requires_token(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    assert client.put("/api/v1/sync/papers", json={"zotero_item_key": "ABC12345", "title": "x"}).status_code == 401
    assert client.delete("/api/v1/sync/papers/ABC12345").status_code == 401


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
    ranged = client.get("/api/v1/papers/C8TQ6QR5/pdf", headers={"Range": "bytes=0-3"})
    assert ranged.status_code == 206
    assert ranged.content == b"%PDF"


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


def test_chinese_title_roundtrip(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _ingest_paper(client, key="ZHCN0001", title="基于长上下文的智能体记忆")
    listed = client.get("/api/v1/papers", params={"q": "智能体"}).json()["papers"]
    assert listed[0]["title"] == "基于长上下文的智能体记忆"
