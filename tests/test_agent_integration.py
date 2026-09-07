from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from tests.fakes import FakeZotero
from wepaper.agent import run_sync
from wepaper.config import AgentConfig
from wepaper.remote import ServerClient
from wepaper.server import create_app

MINIMAL_PDF = b"""%PDF-1.1
1 0 obj<<>>endobj
trailer<<>>
%%EOF
"""

REPLACED_PDF = MINIMAL_PDF + b"\n%rev2\n"


def _harness(tmp_path: Path):
    app = create_app(
        {
            "WEPAPER_DATA_DIR": str(tmp_path / "server"),
            "WEPAPER_SYNC_TOKEN": "secret-token",
            "WEPAPER_OWNER_PASSWORD": "owner-secret",
        }
    )
    http = TestClient(app)
    remote = ServerClient("", "secret-token", client=http)
    zotero = FakeZotero()
    config = AgentConfig(
        collection_names=["wePaper"],
        server_url="",
        sync_token="secret-token",
        poll_seconds=1,
        state_dir=tmp_path / "state",
        zotero_api="http://127.0.0.1:9/api",
    )
    pdf = tmp_path / "paper.pdf"
    pdf.write_bytes(MINIMAL_PDF)
    return zotero, remote, config, http, pdf


def _titles(http: TestClient) -> list[str]:
    return [paper["title"] for paper in http.get("/api/v1/papers").json()["papers"]]


def test_empty_library(tmp_path: Path) -> None:
    zotero, remote, config, http, _ = _harness(tmp_path)
    assert run_sync(source=zotero, remote=remote, config=config) == 0
    assert _titles(http) == []


def test_add_one_and_several(tmp_path: Path) -> None:
    zotero, remote, config, http, pdf = _harness(tmp_path)
    zotero.add_pdf(item_key="ITEM0001", title="First paper", pdf_path=pdf, attachment_key="ATT00001")
    assert run_sync(source=zotero, remote=remote, config=config) == 0
    assert _titles(http) == ["First paper"]
    second = tmp_path / "second.pdf"
    second.write_bytes(MINIMAL_PDF)
    zotero.add_pdf(item_key="ITEM0002", title="Second paper", pdf_path=second, attachment_key="ATT00002")
    zotero.add_pdf(item_key="ITEM0003", title="Third paper", pdf_path=second, attachment_key="ATT00003")
    assert run_sync(source=zotero, remote=remote, config=config) == 0
    assert len(_titles(http)) == 3
    pdf_res = http.get("/api/v1/papers/ITEM0001/pdf")
    assert pdf_res.status_code == 200
    assert pdf_res.content.startswith(b"%PDF")


def test_reading_status_survives_zotero_metadata_and_pdf_replace(tmp_path: Path) -> None:
    zotero, remote, config, http, pdf = _harness(tmp_path)
    zotero.add_pdf(item_key="ITEM0001", title="Old title", pdf_path=pdf, attachment_key="ATT00001", version=1)
    run_sync(source=zotero, remote=remote, config=config)
    patched = http.patch("/api/v1/papers/ITEM0001/status", json={"reading_status": "pending_deep"})
    assert patched.status_code == 200
    zotero.papers["ITEM0001"].record.title = "New title"
    zotero.papers["ITEM0001"].state.title = "New title"
    zotero.papers["ITEM0001"].state.version = 2
    zotero.papers["ITEM0001"].record.zotero_version = 2
    run_sync(source=zotero, remote=remote, config=config)
    paper = http.get("/api/v1/papers/ITEM0001").json()
    assert paper["title"] == "New title"
    assert paper["reading_status"] == "pending_deep"
    replaced = tmp_path / "replaced.pdf"
    replaced.write_bytes(REPLACED_PDF)
    zotero.add_pdf(item_key="ITEM0001", title="New title", pdf_path=replaced, attachment_key="ATT00001", version=3)
    run_sync(source=zotero, remote=remote, config=config)
    again = http.get("/api/v1/papers/ITEM0001").json()
    assert again["reading_status"] == "pending_deep"
    assert http.get("/api/v1/papers/ITEM0001/pdf").content.endswith(b"%rev2\n")


def test_reading_status_survives_hide_and_reappear(tmp_path: Path) -> None:
    zotero, remote, config, http, pdf = _harness(tmp_path)
    zotero.add_pdf(item_key="ITEM0001", title="Keep status", pdf_path=pdf, attachment_key="ATT00001")
    run_sync(source=zotero, remote=remote, config=config)
    assert http.patch("/api/v1/papers/ITEM0001/status", json={"reading_status": "deep_reading"}).status_code == 200
    zotero.remove("ITEM0001")
    run_sync(source=zotero, remote=remote, config=config)
    assert http.get("/api/v1/papers/ITEM0001").status_code == 404
    zotero.add_pdf(item_key="ITEM0001", title="Keep status", pdf_path=pdf, attachment_key="ATT00001", version=2)
    run_sync(source=zotero, remote=remote, config=config)
    paper = http.get("/api/v1/papers/ITEM0001").json()
    assert paper["reading_status"] == "deep_reading"


def test_comments_survive_zotero_metadata_update_and_hide(tmp_path: Path) -> None:
    zotero, remote, config, http, pdf = _harness(tmp_path)
    zotero.add_pdf(item_key="ITEM0001", title="Keep comments", pdf_path=pdf, attachment_key="ATT00001")
    run_sync(source=zotero, remote=remote, config=config)
    created = http.post("/api/v1/papers/ITEM0001/comments", json={"body": "stable thread"})
    assert created.status_code == 201
    zotero.papers["ITEM0001"].record.title = "Renamed"
    zotero.papers["ITEM0001"].state.title = "Renamed"
    zotero.papers["ITEM0001"].state.version = 2
    zotero.papers["ITEM0001"].record.zotero_version = 2
    run_sync(source=zotero, remote=remote, config=config)
    thread = http.get("/api/v1/papers/ITEM0001/comments").json()["comments"]
    assert [item["body"] for item in thread] == ["stable thread"]
    assert http.get("/api/v1/papers/ITEM0001").json()["comment_count"] == 1
    zotero.remove("ITEM0001")
    run_sync(source=zotero, remote=remote, config=config)
    zotero.add_pdf(item_key="ITEM0001", title="Renamed", pdf_path=pdf, attachment_key="ATT00001", version=3)
    run_sync(source=zotero, remote=remote, config=config)
    again = http.get("/api/v1/papers/ITEM0001/comments").json()["comments"]
    assert [item["body"] for item in again] == ["stable thread"]


def test_update_metadata_and_replace_pdf(tmp_path: Path) -> None:
    zotero, remote, config, http, pdf = _harness(tmp_path)
    zotero.add_pdf(item_key="ITEM0001", title="Old title", pdf_path=pdf, attachment_key="ATT00001", version=1)
    run_sync(source=zotero, remote=remote, config=config)
    zotero.papers["ITEM0001"].record.title = "New title"
    zotero.papers["ITEM0001"].state.title = "New title"
    zotero.papers["ITEM0001"].state.version = 2
    zotero.papers["ITEM0001"].record.zotero_version = 2
    run_sync(source=zotero, remote=remote, config=config)
    assert _titles(http) == ["New title"]
    replaced = tmp_path / "replaced.pdf"
    replaced.write_bytes(REPLACED_PDF)
    zotero.add_pdf(item_key="ITEM0001", title="New title", pdf_path=replaced, attachment_key="ATT00001", version=3)
    run_sync(source=zotero, remote=remote, config=config)
    assert http.get("/api/v1/papers/ITEM0001/pdf").content.endswith(b"%rev2\n")


def test_remove_hides_and_restart_is_safe(tmp_path: Path) -> None:
    zotero, remote, config, http, pdf = _harness(tmp_path)
    zotero.add_pdf(item_key="ITEM0001", title="Keep me", pdf_path=pdf, attachment_key="ATT00001")
    zotero.add_pdf(item_key="ITEM0002", title="Hide me", pdf_path=pdf, attachment_key="ATT00002")
    run_sync(source=zotero, remote=remote, config=config)
    zotero.remove("ITEM0002")
    run_sync(source=zotero, remote=remote, config=config)
    assert _titles(http) == ["Keep me"]
    run_sync(source=zotero, remote=remote, config=config)
    run_sync(source=zotero, remote=remote, config=config)
    assert _titles(http) == ["Keep me"]
    blobs = list((tmp_path / "server" / "blobs").rglob("*.pdf"))
    assert len(blobs) == 1


def test_unicode_chinese_and_long_title(tmp_path: Path) -> None:
    zotero, remote, config, http, pdf = _harness(tmp_path)
    weird = tmp_path / "Xu 等 - 记忆系统.pdf"
    weird.write_bytes(MINIMAL_PDF)
    zotero.add_pdf(
        item_key="ZHCN0001",
        title="基于长上下文的智能体记忆系统研究" + ("很长" * 40),
        pdf_path=weird,
        attachment_key="ATTZH001",
        authors="黄镇雨",
    )
    assert run_sync(source=zotero, remote=remote, config=config) == 0
    paper = http.get("/api/v1/papers/ZHCN0001").json()
    assert paper["title"].startswith("基于长上下文")
    assert paper["authors"] == "黄镇雨"
    assert http.get("/api/v1/papers/ZHCN0001/pdf").status_code == 200


def test_retry_after_failed_upload(tmp_path: Path, monkeypatch) -> None:
    zotero, remote, config, http, pdf = _harness(tmp_path)
    zotero.add_pdf(item_key="ITEM0001", title="Retry me", pdf_path=pdf, attachment_key="ATT00001")
    calls = {"n": 0}
    original = remote.upload_pdf

    def flaky(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("network interrupted")
        return original(*args, **kwargs)

    monkeypatch.setattr(remote, "upload_pdf", flaky)
    assert run_sync(source=zotero, remote=remote, config=config) == 1
    monkeypatch.setattr(remote, "upload_pdf", original)
    assert run_sync(source=zotero, remote=remote, config=config) == 0
    assert _titles(http) == ["Retry me"]
    assert http.get("/api/v1/papers/ITEM0001/pdf").status_code == 200
