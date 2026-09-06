"""Keep in lockstep with web/src/pdfWindow.ts."""


def page_window(current: int, total: int, buffer: int = 2) -> list[int]:
    if total < 1:
        return []
    page = min(total, max(1, current))
    start = max(1, page - buffer)
    end = min(total, page + buffer)
    return list(range(start, end + 1))


def test_window_edges() -> None:
    assert page_window(1, 12) == [1, 2, 3]
    assert page_window(12, 12) == [10, 11, 12]
    assert page_window(6, 12) == [4, 5, 6, 7, 8]
    assert page_window(1, 2) == [1, 2]
    assert page_window(1, 0) == []
