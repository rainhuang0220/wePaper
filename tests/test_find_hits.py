"""Keep in lockstep with web/src/findHits.ts."""


def find_page_hits(pages: list[str], query: str) -> list[int]:
    needle = query.strip().lower()
    if not needle:
        return []
    return [index + 1 for index, text in enumerate(pages) if needle in text.lower()]


def next_hit(hits: list[int], current: int) -> int | None:
    if not hits:
        return None
    return next((page for page in hits if page > current), hits[0])


def prev_hit(hits: list[int], current: int) -> int | None:
    if not hits:
        return None
    earlier = next((page for page in reversed(hits) if page < current), None)
    return earlier if earlier is not None else hits[-1]


def test_find_wraps() -> None:
    pages = ["alpha", "beta gamma", "alpha again", "delta"]
    hits = find_page_hits(pages, "alpha")
    assert hits == [1, 3]
    assert next_hit(hits, 1) == 3
    assert next_hit(hits, 3) == 1
    assert prev_hit(hits, 3) == 1
    assert prev_hit(hits, 1) == 3
    assert find_page_hits(pages, "  ") == []
    assert next_hit([], 2) is None
