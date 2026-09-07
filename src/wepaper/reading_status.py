from __future__ import annotations

STATUSES = (
    "pending_browse",
    "pending_deep",
    "browsing",
    "deep_reading",
    "browsed",
    "deep_read",
)

LABELS = {
    "pending_browse": "待泛读",
    "pending_deep": "待精读",
    "browsing": "泛读中",
    "deep_reading": "精读中",
    "browsed": "已泛读",
    "deep_read": "已精读",
}

FILTERS = (
    "all",
    "unread",
    "reading",
    "read",
    *STATUSES,
)

_GROUPS = {
    "unread": ("pending_browse", "pending_deep"),
    "reading": ("browsing", "deep_reading"),
    "read": ("browsed", "deep_read"),
}


def parse_reading_status(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    if text not in STATUSES:
        raise ValueError("invalid reading status")
    return text


def filter_values(name: str | None) -> list[str]:
    if not name or name == "all":
        return []
    if name in _GROUPS:
        return list(_GROUPS[name])
    if name in STATUSES:
        return [name]
    raise ValueError("invalid reading status filter")
