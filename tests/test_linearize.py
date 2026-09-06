from pathlib import Path

from wepaper.linearize import ensure_linearized, linearized_path, linearize_blob_tree
from wepaper.settings import Settings

MINIMAL_PDF = b"""%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj
trailer<</Root 1 0 R>>
%%EOF
"""


def test_ensure_linearized_writes_pdf(tmp_path: Path) -> None:
    source = tmp_path / "in.pdf"
    dest = tmp_path / "out.pdf"
    source.write_bytes(MINIMAL_PDF)
    written = ensure_linearized(source, dest)
    assert written is not None
    assert written.read_bytes().startswith(b"%PDF")
    again = ensure_linearized(source, dest)
    assert again == written


def test_tree_skips_missing_dir(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path / "missing")
    assert linearize_blob_tree(settings) == 0
    assert linearized_path(Settings(data_dir=tmp_path), "ab" * 32 + ".pdf").name.endswith(".pdf")
