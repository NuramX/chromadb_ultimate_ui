"""Migration jobs: pre-flight compat check, start, status, resume, pause."""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException

from ..db import connect
from ..models import CompatReport, JobStatus, MigrateBatchRequest, MigrateRequest
from ..services import migrator


def _insert_job(c, source_conn: int, target_conn: int, source_coll: str,
                target_coll: str, batch_size: int, where=None) -> int:
    cur = c.execute(
        "INSERT INTO jobs (source_conn_id, target_conn_id, source_collection,"
        " target_collection, batch_size, where_json) VALUES (?,?,?,?,?,?)",
        (source_conn, target_conn, source_coll, target_coll, batch_size,
         json.dumps(where) if where else None),
    )
    return cur.lastrowid

router = APIRouter(prefix="/jobs", tags=["migration"])


def _job(job_id: int):
    with connect() as c:
        row = c.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "job not found")
    return row


def _status(row) -> JobStatus:
    return JobStatus(
        id=row["id"], state=row["state"],
        source_conn_id=row["source_conn_id"],
        target_conn_id=row["target_conn_id"],
        source_collection=row["source_collection"],
        target_collection=row["target_collection"],
        total=row["total"], processed=row["processed"],
        checkpoint_offset=row["checkpoint_offset"], error=row["error"],
    )


@router.post("/compat", response_model=CompatReport)
def check_compat(body: MigrateRequest):
    target = body.target_collection or body.source_collection
    try:
        return CompatReport(**migrator.compat_report(
            body.source_connection_id, body.target_connection_id,
            body.source_collection, target,
        ))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, str(e))


@router.post("", response_model=JobStatus)
def create_job(body: MigrateRequest):
    target = body.target_collection or body.source_collection
    with connect() as c:
        job_id = _insert_job(c, body.source_connection_id, body.target_connection_id,
                             body.source_collection, target, body.batch_size, body.where)
    migrator.enqueue(job_id)
    return _status(_job(job_id))


@router.post("/batch", response_model=list[JobStatus])
def create_batch(body: MigrateBatchRequest):
    """Queue many collections at once. They run one at a time (sequential),
    in the order given — never in parallel."""
    job_ids: list[int] = []
    with connect() as c:
        for coll in body.source_collections:
            job_ids.append(_insert_job(
                c, body.source_connection_id, body.target_connection_id,
                coll, coll, body.batch_size))
    for jid in job_ids:        # enqueue after commit so workers see the rows
        migrator.enqueue(jid)
    return [_status(_job(jid)) for jid in job_ids]


@router.get("", response_model=list[JobStatus])
def list_jobs():
    with connect() as c:
        rows = c.execute("SELECT * FROM jobs ORDER BY id DESC").fetchall()
    return [_status(r) for r in rows]


@router.get("/{job_id}", response_model=JobStatus)
def get_job(job_id: int):
    return _status(_job(job_id))


@router.post("/{job_id}/resume", response_model=JobStatus)
def resume_job(job_id: int):
    row = _job(job_id)
    if row["state"] in ("running", "done"):
        raise HTTPException(409, f"job is {row['state']}")
    migrator.enqueue(job_id)  # re-queued; resumes from checkpoint_offset
    return _status(_job(job_id))


@router.post("/{job_id}/pause", response_model=JobStatus)
def pause_job(job_id: int):
    migrator.cancel(job_id)
    return _status(_job(job_id))


@router.delete("/{job_id}")
def delete_job(job_id: int):
    """Remove a job from history. Refuses while it is still running/queued."""
    row = _job(job_id)
    if row["state"] in ("running", "pending"):
        raise HTTPException(409, f"job is {row['state']} — pause it first")
    with connect() as c:
        c.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
    return {"ok": True}


@router.post("/clear-finished")
def clear_finished():
    """Drop all done/error jobs from history (keeps running/paused)."""
    with connect() as c:
        cur = c.execute("DELETE FROM jobs WHERE state IN ('done', 'error')")
        return {"deleted": cur.rowcount}
