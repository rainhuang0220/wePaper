import pytest

from wepaper.reading_status import (
    FILTERS,
    LABELS,
    STATUSES,
    filter_values,
    parse_reading_status,
)


def test_six_canonical_statuses_and_chinese_labels() -> None:
    assert STATUSES == (
        "pending_browse",
        "pending_deep",
        "browsing",
        "deep_reading",
        "browsed",
        "deep_read",
    )
    assert LABELS == {
        "pending_browse": "待泛读",
        "pending_deep": "待精读",
        "browsing": "泛读中",
        "deep_reading": "精读中",
        "browsed": "已泛读",
        "deep_read": "已精读",
    }


def test_parse_accepts_canonical_values_and_null() -> None:
    for value in STATUSES:
        assert parse_reading_status(value) == value
    assert parse_reading_status(None) is None
    assert parse_reading_status("") is None


def test_parse_rejects_arbitrary_strings() -> None:
    with pytest.raises(ValueError):
        parse_reading_status("Exploring")
    with pytest.raises(ValueError):
        parse_reading_status("pending_browse,deep_read")


def test_filter_values_include_exact_and_aggregates() -> None:
    assert filter_values("pending_deep") == ["pending_deep"]
    assert set(filter_values("unread")) == {"pending_browse", "pending_deep"}
    assert set(filter_values("reading")) == {"browsing", "deep_reading"}
    assert set(filter_values("read")) == {"browsed", "deep_read"}
    assert filter_values("all") == []
    assert "all" in FILTERS
