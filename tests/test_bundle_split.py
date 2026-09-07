from pathlib import Path


def test_catalog_bundle_does_not_embed_pdfjs_viewer() -> None:
    assets = Path(__file__).resolve().parents[1] / "web" / "dist" / "assets"
    index_js = next(assets.glob("index-*.js"), None)
    paper_js = next(assets.glob("PaperPage-*.js"), None)
    assert index_js is not None
    assert paper_js is not None
    catalog = index_js.read_text(encoding="utf-8", errors="ignore")
    viewer = paper_js.read_text(encoding="utf-8", errors="ignore")
    assert "PDFViewer" not in catalog
    assert "pdf.worker" not in catalog
    assert "PDFViewer" in viewer
