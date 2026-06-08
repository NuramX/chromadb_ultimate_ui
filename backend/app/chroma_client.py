"""Build chromadb.HttpClient from a saved connection row."""
from __future__ import annotations

import sqlite3

import chromadb
from chromadb.config import Settings

from . import config


class ConnectionNotFound(Exception):
    pass


def _row(conn_id: int) -> sqlite3.Row:
    from .db import connect

    with connect() as c:
        row = c.execute("SELECT * FROM connections WHERE id = ?", (conn_id,)).fetchone()
    if row is None:
        raise ConnectionNotFound(f"connection {conn_id} not found")
    return row


def client_for(conn_id: int) -> chromadb.api.ClientAPI:
    """Return an HttpClient for the saved connection.

    Token (if any) is sent as a Bearer Authorization header.
    """
    row = _row(conn_id)
    token = config.decrypt(row["token_enc"])
    settings = Settings(anonymized_telemetry=False)
    if token:
        settings = Settings(
            anonymized_telemetry=False,
            chroma_client_auth_provider="chromadb.auth.token_authn.TokenAuthClientProvider",
            chroma_client_auth_credentials=token,
        )
    return chromadb.HttpClient(
        host=row["host"],
        port=row["port"],
        ssl=bool(row["ssl"]),
        tenant=row["tenant"],
        database=row["database"],
        settings=settings,
    )


def ping(conn_id: int) -> int:
    """Heartbeat check — returns server nanosecond timestamp."""
    return client_for(conn_id).heartbeat()
