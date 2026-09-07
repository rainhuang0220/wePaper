from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_V1 = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS papers (
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
    reading_status TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
    zotero_attachment_key TEXT PRIMARY KEY,
    paper_key TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    mtime INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY (paper_key) REFERENCES papers(zotero_item_key)
);

CREATE TABLE IF NOT EXISTS sync_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    library_version INTEGER NOT NULL DEFAULT 0,
    zotero_server_id TEXT,
    last_sync_at TEXT,
    last_success_at TEXT
);

CREATE TABLE IF NOT EXISTS paper_comments (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL,
    parent_id TEXT,
    body TEXT NOT NULL,
    display_name TEXT,
    like_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (paper_id) REFERENCES papers(zotero_item_key),
    FOREIGN KEY (parent_id) REFERENCES paper_comments(id)
);

CREATE INDEX IF NOT EXISTS idx_papers_collection ON papers(collection);
CREATE INDEX IF NOT EXISTS idx_papers_year ON papers(year);
CREATE INDEX IF NOT EXISTS idx_papers_hidden ON papers(hidden, tombstoned, visibility);
CREATE INDEX IF NOT EXISTS idx_attachments_paper ON attachments(paper_key);
CREATE INDEX IF NOT EXISTS idx_attachments_checksum ON attachments(checksum);
CREATE INDEX IF NOT EXISTS idx_comments_paper ON paper_comments(paper_id, created_at);
"""


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class _Fetched:
    def __init__(self, rows: list) -> None:
        self._rows = rows

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return list(self._rows)

    def __iter__(self):
        return iter(self._rows)


class LockedConnection:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn
        self._lock = threading.Lock()

    def execute(self, *args, **kwargs):
        with self._lock:
            return _Fetched(self._conn.execute(*args, **kwargs).fetchall())

    def executescript(self, script: str):
        with self._lock:
            self._conn.executescript(script)
        return self

    def commit(self) -> None:
        with self._lock:
            self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()


def connect(path: Path) -> LockedConnection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return LockedConnection(conn)


def migrate(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_V1)
    applied = {row[0] for row in conn.execute("SELECT id FROM schema_migrations")}
    if "001_init" not in applied:
        conn.execute("INSERT INTO schema_migrations(id, applied_at) VALUES (?, ?)", ("001_init", utcnow()))
    if conn.execute("SELECT 1 FROM sync_state WHERE id = 1").fetchone() is None:
        conn.execute("INSERT INTO sync_state(id, library_version) VALUES (1, 0)")
    if "002_reading_status" not in applied:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(papers)")}
        if "reading_status" not in columns:
            conn.execute("ALTER TABLE papers ADD COLUMN reading_status TEXT")
        conn.execute(
            "INSERT INTO schema_migrations(id, applied_at) VALUES (?, ?)",
            ("002_reading_status", utcnow()),
        )
    if "003_paper_comments" not in applied:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS paper_comments (
                id TEXT PRIMARY KEY,
                paper_id TEXT NOT NULL,
                parent_id TEXT,
                body TEXT NOT NULL,
                display_name TEXT,
                like_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (paper_id) REFERENCES papers(zotero_item_key),
                FOREIGN KEY (parent_id) REFERENCES paper_comments(id)
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_comments_paper ON paper_comments(paper_id, created_at)"
        )
        conn.execute(
            "INSERT INTO schema_migrations(id, applied_at) VALUES (?, ?)",
            ("003_paper_comments", utcnow()),
        )
    conn.commit()
