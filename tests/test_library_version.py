from pathlib import Path

from tests.test_api import MINIMAL_PDF, _ingest_paper, auth, make_client


def test_library_version_is_public_and_stable(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    first = client.get("/api/v1/library/version")
    assert first.status_code == 200
    assert "version" in first.json()
    second = client.get("/api/v1/library/version")
    assert second.json()["version"] == first.json()["version"]


def test_library_version_changes_when_paper_is_ingested(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    before = client.get("/api/v1/library/version").json()["version"]
    _ingest_paper(client, key="NEWPAPER", title="Brand new")
    after = client.get("/api/v1/library/version").json()["version"]
    assert after != before


def test_library_version_changes_on_hide_and_pdf_replace(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    _ingest_paper(client)
    after_meta = client.get("/api/v1/library/version").json()["version"]
    upload = client.put(
        "/api/v1/sync/attachments/LCYIEFND",
        headers={**auth(), "X-Wepaper-Item-Key": "C8TQ6QR5", "X-Wepaper-Filename": "paper.pdf"},
        files={"file": ("paper.pdf", MINIMAL_PDF, "application/pdf")},
    )
    assert upload.status_code in {200, 201}
    after_pdf = client.get("/api/v1/library/version").json()["version"]
    assert after_pdf != after_meta
    client.post("/api/v1/sync/papers/C8TQ6QR5/hide", headers=auth())
    after_hide = client.get("/api/v1/library/version").json()["version"]
    assert after_hide != after_pdf


def test_public_catalog_paginates_beyond_first_page(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    for index in range(3):
        _ingest_paper(client, key=f"PAGE000{index}", title=f"Page paper {index}")
    first = client.get("/api/v1/papers?limit=1&offset=0").json()
    second = client.get("/api/v1/papers?limit=1&offset=1").json()
    assert first["total"] == 3
    assert len(first["papers"]) == 1
    assert second["papers"][0]["zotero_item_key"] != first["papers"][0]["zotero_item_key"]


def test_library_version_does_not_require_sync_token(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    assert client.get("/api/v1/library/version").status_code == 200
    assert client.get("/api/v1/sync/state").status_code == 401
