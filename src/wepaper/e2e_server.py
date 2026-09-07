from __future__ import annotations

import os
from pathlib import Path

import uvicorn

from wepaper.checksum import sha256_bytes
from wepaper.db import connect, migrate, utcnow
from wepaper.sanitize import safe_storage_name
from wepaper.server import create_app

MINIMAL_PDF = b"""%PDF-1.1
1 0 obj<<>>endobj
trailer<<>>
%%EOF
"""

TOKEN = "e2e-token"
HOST = os.environ.get("WEPAPER_E2E_HOST", "127.0.0.1")
PORT = int(os.environ.get("WEPAPER_E2E_PORT", "8799"))


def seed_db(data_dir: Path) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    conn = connect(data_dir / "wepaper.sqlite")
    migrate(conn)
    now = utcnow()
    blob_root = data_dir / "blobs"
    for key, title in (("TEST0001", "Fixture memory paper"), ("TEST0002", "Other fixture paper")):
        conn.execute(
            """
            INSERT INTO papers(
                zotero_item_key, title, authors, year, venue, doi, abstract, tags_json,
                collection, date_added, date_modified, visibility, hidden, tombstoned,
                zotero_version, created_at, updated_at
            ) VALUES (?, ?, ?, 2026, NULL, NULL, NULL, '[]', 'wePaper E2E', ?, ?, 'public', 0, 0, 1, ?, ?)
            ON CONFLICT(zotero_item_key) DO NOTHING
            """,
            (key, title, "Ada Lovelace, Alan Turing", now, now, now, now),
        )
        checksum = sha256_bytes(MINIMAL_PDF)
        storage = safe_storage_name(checksum, f"{key}.pdf")
        dest = blob_root / storage[:2] / storage[2:4] / storage
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(MINIMAL_PDF)
        conn.execute(
            """
            INSERT INTO attachments(
                zotero_attachment_key, paper_key, filename, mime, size, checksum, storage_key, mtime, created_at
            ) VALUES (?, ?, ?, 'application/pdf', ?, ?, ?, NULL, ?)
            ON CONFLICT(zotero_attachment_key) DO NOTHING
            """,
            (f"A{key[1:]}", key, f"{key}.pdf", len(MINIMAL_PDF), checksum, storage, now),
        )
    conn.execute("DELETE FROM paper_comments")
    conn.execute("UPDATE papers SET reading_status = NULL")
    conn.commit()
    conn.close()


def main() -> None:
    data_dir = Path(os.environ.get("WEPAPER_E2E_DATA", "/tmp/wepaper-e2e"))
    seed_db(data_dir)
    app = create_app(
        {
            "WEPAPER_DATA_DIR": str(data_dir),
            "WEPAPER_SYNC_TOKEN": TOKEN,
            "WEPAPER_PUBLIC_URL": f"http://{HOST}:{PORT}",
        }
    )
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")


if __name__ == "__main__":
    main()
