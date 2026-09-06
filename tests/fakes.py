from __future__ import annotations

from pathlib import Path

from wepaper.normalize import PaperRecord
from wepaper.sync_plan import AttachmentState, PaperState
from wepaper.zotero import DiscoveredPaper, Probe


class FakeZotero:
    def __init__(self) -> None:
        self.papers: dict[str, DiscoveredPaper] = {}
        self.collection_name = "wePaper"
        self.api_enabled = True
        self.running = True
        self.library_version = 1
        self.server_id = "test-server"

    def probe(self) -> Probe:
        if not self.running:
            return Probe(False, False, "Zotero is not running")
        if not self.api_enabled:
            return Probe(True, False, "Local API is not enabled")
        return Probe(True, True, "ok", self.server_id, "3")

    def collections(self) -> list[dict]:
        return [{"key": "COL00001", "data": {"name": self.collection_name}}]

    def add_pdf(
        self,
        *,
        item_key: str,
        title: str,
        pdf_path: Path,
        attachment_key: str,
        authors: str = "Ada Lovelace",
        year: int = 2026,
        version: int = 1,
        tags: list[str] | None = None,
    ) -> None:
        record = PaperRecord(
            zotero_item_key=item_key,
            title=title,
            authors=authors,
            year=year,
            venue="Test Venue",
            doi=None,
            abstract="An abstract.",
            tags=tags or [],
            collection=self.collection_name,
            visibility="public",
            zotero_version=version,
        )
        digest = __import__("hashlib").sha256(pdf_path.read_bytes()).hexdigest()
        self.papers[item_key] = DiscoveredPaper(
            record=record,
            state=PaperState(
                item_key=item_key,
                title=title,
                version=version,
                attachments=[
                    AttachmentState(
                        attachment_key=attachment_key,
                        sha256=digest,
                        filename=pdf_path.name,
                        size=pdf_path.stat().st_size,
                    )
                ],
            ),
            files={attachment_key: pdf_path},
        )
        self.library_version += 1

    def remove(self, item_key: str) -> None:
        self.papers.pop(item_key, None)
        self.library_version += 1

    def discover(self, collection_names: list[str]) -> tuple[list[DiscoveredPaper], int, str | None]:
        if self.collection_name not in collection_names:
            return [], self.library_version, self.server_id
        return list(self.papers.values()), self.library_version, self.server_id
