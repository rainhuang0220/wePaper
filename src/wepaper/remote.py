from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx

from wepaper.sync_plan import AttachmentState, PaperState


class ServerClient:
    def __init__(self, base_url: str, token: str, client: httpx.Client | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.client = client or httpx.Client(timeout=120.0)

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    def health(self) -> bool:
        res = self.client.get(f"{self.base_url}/api/v1/health")
        return res.status_code == 200 and res.json().get("status") == "ok"

    def remote_papers(self) -> list[PaperState]:
        res = self.client.get(f"{self.base_url}/api/v1/sync/papers", headers=self._headers())
        res.raise_for_status()
        papers: list[PaperState] = []
        for item in res.json().get("papers", []):
            if item.get("hidden") or item.get("tombstoned"):
                continue
            papers.append(
                PaperState(
                    item_key=item["zotero_item_key"],
                    title=item["title"],
                    version=int(item.get("zotero_version") or 0),
                    attachments=[
                        AttachmentState(
                            attachment_key=att["zotero_attachment_key"],
                            sha256=att["checksum"],
                            filename=att["filename"],
                            size=int(att.get("size") or 0),
                        )
                        for att in item.get("attachments") or []
                    ],
                )
            )
        return papers

    def upsert_paper(self, payload: dict[str, Any]) -> None:
        res = self.client.put(f"{self.base_url}/api/v1/sync/papers", headers=self._headers(), json=payload)
        res.raise_for_status()

    def upload_pdf(self, item_key: str, attachment_key: str, path: Path, checksum: str) -> None:
        header_name = path.name.encode("ascii", "replace").decode("ascii") or "paper.pdf"
        if not header_name.lower().endswith(".pdf"):
            header_name = "paper.pdf"
        with path.open("rb") as handle:
            res = self.client.put(
                f"{self.base_url}/api/v1/sync/attachments/{attachment_key}",
                headers={
                    **self._headers(),
                    "X-Wepaper-Item-Key": item_key,
                    "X-Wepaper-Filename": header_name,
                    "X-Wepaper-Checksum": checksum,
                },
                files={"file": (header_name, handle, "application/pdf")},
            )
        res.raise_for_status()

    def hide(self, item_key: str) -> None:
        res = self.client.post(f"{self.base_url}/api/v1/sync/papers/{item_key}/hide", headers=self._headers())
        res.raise_for_status()

    def tombstone(self, item_key: str) -> None:
        res = self.client.delete(f"{self.base_url}/api/v1/sync/papers/{item_key}", headers=self._headers())
        res.raise_for_status()

    def put_state(self, library_version: int, server_id: str | None) -> None:
        res = self.client.put(
            f"{self.base_url}/api/v1/sync/state",
            headers=self._headers(),
            json={"library_version": library_version, "zotero_server_id": server_id},
        )
        res.raise_for_status()

    def get_state(self) -> dict[str, Any]:
        res = self.client.get(f"{self.base_url}/api/v1/sync/state", headers=self._headers())
        res.raise_for_status()
        return res.json()
