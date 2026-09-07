from __future__ import annotations

import secrets
from collections.abc import Mapping
from typing import Any

MAX_BODY = 2000
MAX_DISPLAY_NAME = 40
MAX_REPLY_DEPTH = 1


def parse_comment_body(value: str | None) -> str:
    text = (value or "").strip()
    if not text:
        raise ValueError("empty comment")
    if len(text) > MAX_BODY:
        raise ValueError("comment too long")
    return text


def parse_display_name(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    if len(text) > MAX_DISPLAY_NAME:
        raise ValueError("display name too long")
    return text


def new_comment_id() -> str:
    return secrets.token_urlsafe(9).replace("-", "").replace("_", "")[:12]


def comment_payload(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "paper_id": row["paper_id"],
        "parent_id": row["parent_id"],
        "body": row["body"],
        "display_name": row["display_name"],
        "like_count": int(row["like_count"] or 0),
        "created_at": row["created_at"],
        "replies": [],
    }
