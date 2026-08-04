from __future__ import annotations

import sqlite3
from pathlib import Path


class SearchIndex:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.execute("CREATE TABLE IF NOT EXISTS documents (document_id TEXT PRIMARY KEY, storage_key TEXT NOT NULL, version INTEGER NOT NULL, content_hash TEXT NOT NULL, markdown TEXT NOT NULL)")
        self.db.execute("CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(document_id UNINDEXED, storage_key, content)")
        self.db.commit()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        self.close()
        return False

    def close(self) -> None:
        self.db.close()

    def upsert(self, document_id: str, storage_key: str, version: int, content_hash: str, markdown: str) -> None:
        self.db.execute("DELETE FROM documents_fts WHERE document_id = ?", (document_id,))
        self.db.execute("INSERT OR REPLACE INTO documents VALUES (?, ?, ?, ?, ?)", (document_id, storage_key, version, content_hash, markdown))
        self.db.execute("INSERT INTO documents_fts(document_id, storage_key, content) VALUES (?, ?, ?)", (document_id, storage_key, markdown))
        self.db.commit()

    def remove(self, document_id: str) -> None:
        self.db.execute("DELETE FROM documents WHERE document_id = ?", (document_id,))
        self.db.execute("DELETE FROM documents_fts WHERE document_id = ?", (document_id,))
        self.db.commit()

    def rebuild(self, records: list[dict]) -> None:
        self.db.execute("DELETE FROM documents")
        self.db.execute("DELETE FROM documents_fts")
        for record in records:
            self.db.execute("INSERT INTO documents VALUES (?, ?, ?, ?, ?)", (record["document_id"], record["storage_key"], record["version"], record["hash"], record["markdown"]))
            self.db.execute("INSERT INTO documents_fts(document_id, storage_key, content) VALUES (?, ?, ?)", (record["document_id"], record["storage_key"], record["markdown"]))
        self.db.commit()

    def search(self, query: str, limit: int = 20) -> list[dict]:
        rows = self.db.execute("SELECT d.document_id, d.storage_key, d.version, d.content_hash, snippet(documents_fts, 2, '[', ']', '…', 24) AS snippet FROM documents_fts f JOIN documents d ON d.document_id = f.document_id WHERE documents_fts MATCH ? LIMIT ?", (query, limit)).fetchall()
        return [dict(row) for row in rows]
