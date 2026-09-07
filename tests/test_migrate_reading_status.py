from pathlib import Path

from wepaper.db import connect, migrate


def test_existing_library_gains_reading_status_without_losing_rows(tmp_path: Path) -> None:
    db = tmp_path / "old.sqlite"
    conn = connect(db)
    conn.executescript(
        """
        CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
        CREATE TABLE papers (
            zotero_item_key TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            authors TEXT NOT NULL DEFAULT '',
            year INTEGER,
            venue TEXT,
            doi TEXT,
            abstract TEXT,
            tags_json TEXT NOT NULL DEFAULT '[]',
            collection TEXT NOT NULL DEFAULT '',
            date_added TEXT,
            date_modified TEXT,
            visibility TEXT NOT NULL DEFAULT 'public',
            hidden INTEGER NOT NULL DEFAULT 0,
            tombstoned INTEGER NOT NULL DEFAULT 0,
            zotero_version INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE attachments (
            zotero_attachment_key TEXT PRIMARY KEY,
            paper_key TEXT NOT NULL,
            filename TEXT NOT NULL,
            mime TEXT NOT NULL,
            size INTEGER NOT NULL,
            checksum TEXT NOT NULL,
            storage_key TEXT NOT NULL,
            mtime INTEGER,
            created_at TEXT NOT NULL
        );
        CREATE TABLE sync_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            library_version INTEGER NOT NULL DEFAULT 0,
            zotero_server_id TEXT,
            last_sync_at TEXT,
            last_success_at TEXT
        );
        INSERT INTO schema_migrations(id, applied_at) VALUES ('001_init', '2026-01-01T00:00:00+00:00');
        INSERT INTO papers(zotero_item_key, title, authors, created_at, updated_at)
        VALUES ('OLDKEY01', 'Legacy paper', 'Ada', '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00');
        """
    )
    conn.commit()
    migrate(conn)
    columns = {row[1] for row in conn.execute("PRAGMA table_info(papers)")}
    assert "reading_status" in columns
    paper = conn.execute("SELECT title, reading_status FROM papers WHERE zotero_item_key = 'OLDKEY01'").fetchone()
    assert paper["title"] == "Legacy paper"
    assert paper["reading_status"] is None
    assert conn.execute("SELECT id FROM schema_migrations WHERE id = '002_reading_status'").fetchone()
    conn.close()
