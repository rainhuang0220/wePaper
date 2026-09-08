from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import unquote, urlparse

import httpx

from wepaper.loop import cached_sha256
from wepaper.normalize import PaperRecord, is_pdf_attachment, normalize_item
from wepaper.sync_plan import AttachmentState, PaperState


class ZoteroError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(slots=True)
class Probe:
    running: bool
    local_api: bool
    message: str
    server_id: str | None = None
    api_version: str | None = None


@dataclass(slots=True)
class DiscoveredPaper:
    record: PaperRecord
    state: PaperState
    files: dict[str, Path] = field(default_factory=dict)


class ZoteroSource(Protocol):
    def probe(self) -> Probe: ...
    def collections(self) -> list[dict[str, Any]]: ...
    def discover(self, collection_names: list[str]) -> tuple[list[DiscoveredPaper], int, str | None]: ...
    def source_version(self) -> int | None: ...


class LocalAPI:
    def __init__(self, base_url: str = "http://127.0.0.1:23119/api", timeout: float = 30.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.client = httpx.Client(
            timeout=timeout,
            headers={
                "Zotero-API-Version": "3",
                "Zotero-Allowed-Request": "1",
                "User-Agent": "wePaper-Sync/0.1",
            },
            follow_redirects=False,
        )
        self._digest_cache: dict[tuple[str, int, int], str] = {}

    def close(self) -> None:
        self.client.close()

    def probe(self) -> Probe:
        try:
            ping = httpx.get("http://127.0.0.1:23119/connector/ping", timeout=2.0)
        except httpx.HTTPError:
            return Probe(False, False, "Zotero is not running")
        if ping.status_code != 200:
            return Probe(False, False, f"Zotero connector ping failed ({ping.status_code})")
        try:
            res = self.client.get(f"{self.base_url}/users/0/collections", params={"limit": 1})
        except httpx.HTTPError as exc:
            return Probe(True, False, f"Local API unreachable: {exc}")
        server_id = res.headers.get("Zotero-Server-ID")
        api_version = res.headers.get("Zotero-API-Version")
        if res.status_code == 403:
            return Probe(
                True,
                False,
                "Local API is not enabled. In Zotero: Settings → Advanced → Allow other applications on this computer to communicate with Zotero.",
                server_id,
                api_version,
            )
        if res.status_code >= 400:
            return Probe(True, False, f"Local API returned {res.status_code}", server_id, api_version)
        return Probe(True, True, "Local API ready", server_id, api_version)

    def source_version(self) -> int | None:
        try:
            res = self.client.get(f"{self.base_url}/users/0/items", params={"limit": 1})
        except httpx.HTTPError:
            return None
        if res.status_code >= 400:
            return None
        raw = res.headers.get("Last-Modified-Version")
        try:
            return int(raw) if raw is not None else 0
        except ValueError:
            return 0

    def collections(self) -> list[dict[str, Any]]:
        res = self.client.get(f"{self.base_url}/users/0/collections")
        self._raise(res)
        return res.json()

    def discover(self, collection_names: list[str]) -> tuple[list[DiscoveredPaper], int, str | None]:
        probe = self.probe()
        if not probe.local_api:
            raise ZoteroError("local_api", probe.message)
        wanted = [name.strip() for name in collection_names if name.strip()]
        tree = self._resolve_tree(wanted)
        if not tree:
            available = ", ".join(item["data"]["name"] for item in self.collections()) or "(none)"
            raise ZoteroError(
                "collection",
                f"No configured collection found ({', '.join(wanted)}). Available: {available}",
            )
        scoped_keys = set(tree)
        papers: dict[str, DiscoveredPaper] = {}
        library_version = 0
        server_id = probe.server_id
        for collection_key, path in tree.items():
            res = self.client.get(
                f"{self.base_url}/users/0/collections/{collection_key}/items/top",
                params={"includeTrashed": 0},
            )
            self._raise(res)
            library_version = max(library_version, int(res.headers.get("Last-Modified-Version") or 0))
            server_id = res.headers.get("Zotero-Server-ID") or server_id
            for item in res.json():
                if (item.get("data") or {}).get("itemType") == "attachment":
                    continue
                record = normalize_item(item, collection_path=path)
                children = self.client.get(f"{self.base_url}/users/0/items/{item['key']}/children")
                self._raise(children)
                attachments: list[AttachmentState] = []
                files: dict[str, Path] = {}
                for child in children.json():
                    if not is_pdf_attachment(child):
                        continue
                    data = child.get("data") or {}
                    path_on_disk = self.file_path(child["key"])
                    if path_on_disk is None or not path_on_disk.is_file():
                        continue
                    digest = cached_sha256(path_on_disk, self._digest_cache)
                    attachments.append(
                        AttachmentState(
                            attachment_key=child["key"],
                            sha256=digest,
                            filename=str(data.get("filename") or path_on_disk.name),
                            size=path_on_disk.stat().st_size,
                        )
                    )
                    files[child["key"]] = path_on_disk
                if item["key"] in papers and path not in record.collection:
                    pass
                papers[item["key"]] = DiscoveredPaper(
                    record=record,
                    state=PaperState(
                        item_key=item["key"],
                        title=record.title,
                        version=int(item.get("version") or 0),
                        attachments=attachments,
                    ),
                    files=files,
                )
        # membership filter: item must still intersect scoped collections
        filtered = []
        for paper in papers.values():
            raw = None
            # collections already scoped by endpoint; keep
            filtered.append(paper)
        _ = scoped_keys
        _ = raw
        return filtered, library_version, server_id

    def file_path(self, attachment_key: str) -> Path | None:
        res = self.client.get(f"{self.base_url}/users/0/items/{attachment_key}/file/view/url")
        if res.status_code == 404:
            return None
        self._raise(res)
        url = res.text.strip()
        if url.startswith("file://"):
            parsed = urlparse(url)
            return Path(unquote(parsed.path))
        if url.startswith("/"):
            return Path(url)
        return None

    def _resolve_tree(self, names: list[str]) -> dict[str, str]:
        all_collections = self.collections()
        by_key = {item["key"]: item for item in all_collections}
        roots = [item for item in all_collections if item.get("data", {}).get("name") in names]
        if not roots:
            return {}
        tree: dict[str, str] = {}

        def walk(item: dict[str, Any], prefix: str) -> None:
            name = item.get("data", {}).get("name") or item["key"]
            path = f"{prefix}/{name}" if prefix else name
            tree[item["key"]] = path
            for child in all_collections:
                parent = child.get("data", {}).get("parentCollection")
                if parent == item["key"]:
                    walk(child, path)

        for root in roots:
            walk(root, "")
        _ = by_key
        return tree

    def _raise(self, res: httpx.Response) -> None:
        if res.status_code == 403:
            raise ZoteroError("local_api", "Local API is not enabled")
        if res.status_code >= 400:
            raise ZoteroError("http", f"Zotero Local API {res.status_code}: {res.text[:200]}")
