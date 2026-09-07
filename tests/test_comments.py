from wepaper.comments import (
    MAX_BODY,
    MAX_DISPLAY_NAME,
    new_comment_id,
    parse_comment_body,
    parse_display_name,
)
import pytest


def test_parse_comment_body_trims_and_rejects_empty() -> None:
    assert parse_comment_body("  hello world  ") == "hello world"
    with pytest.raises(ValueError):
        parse_comment_body("   ")
    with pytest.raises(ValueError):
        parse_comment_body("")


def test_parse_comment_body_rejects_oversize() -> None:
    parse_comment_body("x" * MAX_BODY)
    with pytest.raises(ValueError):
        parse_comment_body("x" * (MAX_BODY + 1))


def test_parse_display_name_is_optional_and_bounded() -> None:
    assert parse_display_name(None) is None
    assert parse_display_name("  ") is None
    assert parse_display_name(" Ada ") == "Ada"
    with pytest.raises(ValueError):
        parse_display_name("n" * (MAX_DISPLAY_NAME + 1))


def test_comment_ids_are_short_and_unique() -> None:
    ids = {new_comment_id() for _ in range(20)}
    assert len(ids) == 20
    assert all(8 <= len(item) <= 16 for item in ids)
