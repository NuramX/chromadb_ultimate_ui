"""SQLite store for saved connections and migration jobs."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Iterator

from . import config

_SCHEMA = """
CREATE TABLE IF NOT EXISTS connections (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    host      TEXT NOT NULL,
    port      INTEGER NOT NULL,
    ssl       INTEGER NOT NULL DEFAULT 0,
    tenant    TEXT NOT NULL DEFAULT 'default_tenant',
    database  TEXT NOT NULL DEFAULT 'default_database',
    token_enc TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS jobs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    state             TEXT NOT NULL DEFAULT 'pending',
    source_conn_id    INTEGER NOT NULL,
    target_conn_id    INTEGER NOT NULL,
    source_collection TEXT NOT NULL,
    target_collection TEXT NOT NULL,
    batch_size        INTEGER NOT NULL DEFAULT 1000,
    total             INTEGER NOT NULL DEFAULT 0,
    processed         INTEGER NOT NULL DEFAULT 0,
    checkpoint_offset INTEGER NOT NULL DEFAULT 0,
    error             TEXT
);
"""


def init() -> None:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    with connect() as c:
        c.executescript(_SCHEMA)


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
