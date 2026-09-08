from __future__ import annotations

from pathlib import Path

from wepaper.loop import cached_sha256, pdf_is_stable, should_defer_for_pdfs


def test_recently_written_pdf_is_unstable(tmp_path: Path) -> None:
    pdf = tmp_path / "paper.pdf"
    pdf.write_bytes(b"%PDF-1.1\n%%EOF\n")
    now = pdf.stat().st_mtime
    assert pdf_is_stable(pdf, now=now, quiet_seconds=2.0) is False
    assert pdf_is_stable(pdf, now=now + 2.0, quiet_seconds=2.0) is True


def test_growing_pdf_is_unstable(tmp_path: Path) -> None:
    pdf = tmp_path / "paper.pdf"
    pdf.write_bytes(b"%PDF-1.1\n")
    now = pdf.stat().st_mtime + 5
    assert pdf_is_stable(pdf, now=now, quiet_seconds=2.0, previous_size=4) is False
    pdf.write_bytes(b"%PDF-1.1\n%%EOF\n")
    later = pdf.stat().st_mtime + 5
    assert pdf_is_stable(pdf, now=later, quiet_seconds=2.0, previous_size=pdf.stat().st_size) is True


def test_tracker_requires_two_quiet_size_observations(tmp_path: Path) -> None:
    pdf = tmp_path / "paper.pdf"
    pdf.write_bytes(b"%PDF-1.1\n")
    now = pdf.stat().st_mtime + 10
    sizes: dict[str, int] = {}
    assert should_defer_for_pdfs([pdf], now=now, quiet_seconds=2.0, observed_sizes=sizes) is True
    assert should_defer_for_pdfs([pdf], now=now, quiet_seconds=2.0, observed_sizes=sizes) is False
    pdf.write_bytes(b"%PDF-1.1\n%%EOF\n")
    later = pdf.stat().st_mtime + 10
    assert should_defer_for_pdfs([pdf], now=later, quiet_seconds=2.0, observed_sizes=sizes) is True
    assert should_defer_for_pdfs([pdf], now=later, quiet_seconds=2.0, observed_sizes=sizes) is False


def test_defer_when_any_attachment_is_unstable(tmp_path: Path) -> None:
    stable = tmp_path / "ok.pdf"
    stable.write_bytes(b"%PDF-1.1\n%%EOF\n")
    growing = tmp_path / "new.pdf"
    growing.write_bytes(b"%PDF")
    now = growing.stat().st_mtime
    assert should_defer_for_pdfs([stable, growing], now=now, quiet_seconds=2.0) is True
    assert should_defer_for_pdfs([stable], now=now + 10, quiet_seconds=2.0) is False


def test_digest_cache_skips_unchanged_bytes(tmp_path: Path, monkeypatch) -> None:
    pdf = tmp_path / "paper.pdf"
    pdf.write_bytes(b"%PDF-1.1\n%%EOF\n")
    cache: dict = {}
    first = cached_sha256(pdf, cache)
    calls = {"n": 0}

    def boom(_path: Path) -> str:
        calls["n"] += 1
        raise AssertionError("should not rehash")

    monkeypatch.setattr("wepaper.loop.sha256_file", boom)
    assert cached_sha256(pdf, cache) == first
    assert calls["n"] == 0
    pdf.write_bytes(b"%PDF-1.1\n%%EOF\n%rev\n")
    monkeypatch.undo()
    assert cached_sha256(pdf, cache) != first
