from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


_YEAR = re.compile(r"\b(19|20)\d{2}\b")


@dataclass(slots=True)
class PaperRecord:
    zotero_item_key: str
    title: str
    authors: str
    year: int | None
    venue: str | None
    doi: str | None
    abstract: str | None
    tags: list[str] = field(default_factory=list)
    collection: str = ""
    date_added: str | None = None
    date_modified: str | None = None
    visibility: str = "public"
    zotero_version: int = 0


def extract_year(value: str | None) -> int | None:
    if not value:
        return None
    match = _YEAR.search(value)
    return int(match.group(0)) if match else None


def format_authors(creators: list[dict[str, Any]] | None) -> str:
    names: list[str] = []
    for creator in creators or []:
        role = creator.get("creatorType") or "author"
        if role != "author":
            continue
        if creator.get("name"):
            names.append(str(creator["name"]).strip())
            continue
        first = str(creator.get("firstName") or "").strip()
        last = str(creator.get("lastName") or "").strip()
        full = " ".join(part for part in (first, last) if part)
        if full:
            names.append(full)
    return ", ".join(names)


def visibility_from_tags(tags: list[str]) -> str:
    lowered = {tag.lower().lstrip("#") for tag in tags}
    if "wepaper:private" in lowered:
        return "private"
    if "wepaper:unlisted" in lowered:
        return "unlisted"
    return "public"


def is_pdf_attachment(item: dict[str, Any]) -> bool:
    data = item.get("data") or item
    if data.get("itemType") != "attachment":
        return False
    content_type = str(data.get("contentType") or "").lower()
    filename = str(data.get("filename") or data.get("title") or "").lower()
    return content_type == "application/pdf" or filename.endswith(".pdf")


def normalize_item(item: dict[str, Any], collection_path: str = "") -> PaperRecord:
    data = item.get("data") or {}
    tags = [
        str(tag.get("tag") if isinstance(tag, dict) else tag)
        for tag in data.get("tags") or []
    ]
    tags = [tag for tag in tags if tag and not tag.startswith("/")]
    doi = data.get("DOI") or data.get("doi")
    if not doi:
        extra = str(data.get("extra") or "")
        for line in extra.splitlines():
            if line.lower().startswith("doi:"):
                doi = line.split(":", 1)[1].strip()
                break
    venue = (
        data.get("publicationTitle")
        or data.get("proceedingsTitle")
        or data.get("bookTitle")
        or data.get("conferenceName")
        or data.get("publisher")
    )
    return PaperRecord(
        zotero_item_key=str(item.get("key") or data.get("key") or ""),
        title=str(data.get("title") or "Untitled").strip(),
        authors=format_authors(data.get("creators")),
        year=extract_year(str(data.get("date") or "")),
        venue=str(venue).strip() if venue else None,
        doi=str(doi).strip() if doi else None,
        abstract=str(data.get("abstractNote")).strip() if data.get("abstractNote") else None,
        tags=tags,
        collection=collection_path,
        date_added=data.get("dateAdded"),
        date_modified=data.get("dateModified"),
        visibility=visibility_from_tags(tags),
        zotero_version=int(item.get("version") or data.get("version") or 0),
    )
