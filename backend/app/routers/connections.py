"""Saved-connection CRUD + heartbeat test (DBeaver-style sidebar)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import chroma_client, config
from ..db import connect
from ..models import ConnectionIn, ConnectionOut

router = APIRouter(prefix="/connections", tags=["connections"])


def _to_out(row) -> ConnectionOut:
    return ConnectionOut(
        id=row["id"], name=row["name"], host=row["host"], port=row["port"],
        ssl=bool(row["ssl"]), tenant=row["tenant"], database=row["database"],
        has_token=bool(row["token_enc"]),
    )


@router.get("", response_model=list[ConnectionOut])
def list_connections():
    with connect() as c:
        rows = c.execute("SELECT * FROM connections ORDER BY name").fetchall()
    return [_to_out(r) for r in rows]


@router.post("", response_model=ConnectionOut)
def create_connection(body: ConnectionIn):
    with connect() as c:
        cur = c.execute(
            "INSERT INTO connections (name, host, port, ssl, tenant, database, token_enc)"
            " VALUES (?,?,?,?,?,?,?)",
            (body.name, body.host, body.port, int(body.ssl), body.tenant,
             body.database, config.encrypt(body.token)),
        )
        row = c.execute("SELECT * FROM connections WHERE id = ?", (cur.lastrowid,)).fetchone()
    return _to_out(row)


@router.put("/{conn_id}", response_model=ConnectionOut)
def update_connection(conn_id: int, body: ConnectionIn):
    """Edit/rename a saved connection. Blank token keeps the existing one."""
    with connect() as c:
        row = c.execute("SELECT * FROM connections WHERE id = ?", (conn_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "connection not found")
        token_enc = config.encrypt(body.token) if body.token else row["token_enc"]
        c.execute(
            "UPDATE connections SET name=?, host=?, port=?, ssl=?, tenant=?,"
            " database=?, token_enc=? WHERE id=?",
            (body.name, body.host, body.port, int(body.ssl), body.tenant,
             body.database, token_enc, conn_id),
        )
        row = c.execute("SELECT * FROM connections WHERE id = ?", (conn_id,)).fetchone()
    return _to_out(row)


@router.delete("/{conn_id}")
def delete_connection(conn_id: int):
    with connect() as c:
        c.execute("DELETE FROM connections WHERE id = ?", (conn_id,))
    return {"ok": True}


@router.post("/{conn_id}/test")
def test_connection(conn_id: int):
    try:
        return {"ok": True, "heartbeat_ns": chroma_client.ping(conn_id)}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(e))
