"""Keep in lockstep with web/src/pdfRange.ts."""

MAX_RANGE_BYTES = 262_144


def split_range(begin: int, end: int) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    cursor = begin
    while cursor < end:
        nxt = min(cursor + MAX_RANGE_BYTES, end)
        spans.append((cursor, nxt))
        cursor = nxt
    return spans


def parse_total_length(content_range: str | None, byte_length: int) -> int:
    if content_range:
        slash = content_range.rfind("/")
        if slash >= 0:
            try:
                return int(content_range[slash + 1 :].strip())
            except ValueError:
                pass
    return byte_length


def test_large_request_never_exceeds_256kib() -> None:
    spans = split_range(0, 600_000)
    assert all(end - begin <= MAX_RANGE_BYTES for begin, end in spans)
    assert spans[0] == (0, MAX_RANGE_BYTES)
    assert spans[-1][1] == 600_000


def test_small_range_is_unchanged() -> None:
    assert split_range(100, 200) == [(100, 200)]


def test_tail_xref_is_one_span() -> None:
    assert split_range(2_686_976, 2_706_503) == [(2_686_976, 2_706_503)]


def test_content_range_total() -> None:
    assert parse_total_length("bytes 0-262143/2706503", 262144) == 2_706_503
    assert parse_total_length(None, 228_000) == 228_000
