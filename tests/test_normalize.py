from wepaper.normalize import (
    extract_year,
    format_authors,
    is_pdf_attachment,
    normalize_item,
    visibility_from_tags,
)


ZOTERO_ARTICLE = {
    "key": "C8TQ6QR5",
    "version": 12,
    "data": {
        "itemType": "journalArticle",
        "title": "A-mem: agentic memory for LLM agents",
        "creators": [
            {"creatorType": "author", "firstName": "Wujiang", "lastName": "Xu"},
            {"creatorType": "author", "firstName": "Kai", "lastName": "Mei"},
        ],
        "date": "2026-04-23",
        "publicationTitle": "Advances in Neural Information Processing Systems",
        "DOI": "10.52202/085713-0593",
        "abstractNote": "Memory for agents.",
        "tags": [{"tag": "memory", "type": 0}, {"tag": "wepaper:private", "type": 0}],
        "collections": ["M277TYYA"],
        "dateAdded": "2026-09-02T10:21:23Z",
        "dateModified": "2026-09-02T18:21:23Z",
    },
}


def test_normalize_core_fields() -> None:
    paper = normalize_item(ZOTERO_ARTICLE, collection_path="Agent Memory")
    assert paper.zotero_item_key == "C8TQ6QR5"
    assert paper.title.startswith("A-mem")
    assert paper.year == 2026
    assert paper.venue.startswith("Advances")
    assert paper.doi == "10.52202/085713-0593"
    assert "Memory" in (paper.abstract or "")
    assert "memory" in paper.tags
    assert paper.collection == "Agent Memory"


def test_authors_and_year_helpers() -> None:
    assert format_authors(ZOTERO_ARTICLE["data"]["creators"]) == "Wujiang Xu, Kai Mei"
    assert extract_year("2026-07-00") == 2026
    assert extract_year("n.d.") is None
    assert extract_year("") is None


def test_visibility_private_tag() -> None:
    assert visibility_from_tags(["memory", "#wepaper:private"]) == "private"
    assert visibility_from_tags(["memory", "wepaper:private"]) == "private"
    assert visibility_from_tags(["wepaper:unlisted"]) == "unlisted"
    assert visibility_from_tags(["memory"]) == "public"


def test_chinese_and_long_title() -> None:
    item = {
        "key": "AAAAAAAA",
        "version": 1,
        "data": {
            "itemType": "preprint",
            "title": "基于长上下文的智能体记忆系统研究" + ("很长" * 80),
            "creators": [{"creatorType": "author", "name": "黄镇雨"}],
            "date": "2026",
            "tags": [],
            "collections": [],
        },
    }
    paper = normalize_item(item, collection_path="wePaper")
    assert paper.title.startswith("基于长上下文")
    assert len(paper.title) > 100
    assert paper.authors == "黄镇雨"


def test_pdf_attachment_filter() -> None:
    pdf = {
        "key": "LCYIEFND",
        "data": {
            "itemType": "attachment",
            "parentItem": "C8TQ6QR5",
            "linkMode": "imported_file",
            "contentType": "application/pdf",
            "filename": "paper.pdf",
            "md5": "d" * 32,
        },
    }
    html = {
        "key": "HTMLHTML",
        "data": {
            "itemType": "attachment",
            "contentType": "text/html",
            "filename": "2410.html",
        },
    }
    assert is_pdf_attachment(pdf) is True
    assert is_pdf_attachment(html) is False
    assert is_pdf_attachment(ZOTERO_ARTICLE) is False
