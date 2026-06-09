"""Batched, resumable collection copy between two Chroma servers.

Designed for >1M vectors:
  - fetches all IDs upfront once (include=[] → no blobs, cheap),
    then pages by explicit ID slice → avoids O(N) SQLite offset scan
  - upsert into target → idempotent → safe to resume from a checkpoint
  - progress + checkpoint persisted to SQLite after every batch, so the job
    survives a backend restart (resume via POST /jobs/{id}/resume)
"""
from __future__ import annotations

import json
import queue
import threading
from typing import Optional

from .. import chroma_client, config
from ..db import connect

# What we copy out of the source each page.
_INCLUDE = ["documents", "embeddings", "metadatas"]

# --- Sequential job queue ---------------------------------------------------
# All dump jobs go through one FIFO queue drained by a fixed pool of worker
# threads. The pool size is config.MAX_CONCURRENT_JOBS (default 1), so by
# default exactly ONE collection is copied at a time — the weak source server
# is never hit by parallel jobs. Selecting many collections enqueues many jobs
# that run back-to-back, not together.
_QUEUE: "queue.Queue[int]" = queue.Queue()
_CANCELS: dict[int, threading.Event] = {}  # job_id -> cancel flag (running only)
_CANCELS_LOCK = threading.Lock()
_WORKERS_STARTED = False
_WORKERS_LOCK = threading.Lock()


def compat_report(source_conn: int, target_conn: int,
                  source_coll: str, target_coll: str) -> dict:
    """Pre-flight: compare embedding dimension + distance space."""
    src = chroma_client.client_for(source_conn).get_collection(source_coll)
    s_meta = src.metadata or {}
    s_dim = _peek_dimension(src)
    s_space = s_meta.get("hnsw:space")

    warnings: list[str] = []
    t_dim = t_space = None
    try:
        tgt = chroma_client.client_for(target_conn).get_collection(target_coll)
        t_meta = tgt.metadata or {}
        t_dim = _peek_dimension(tgt)
        t_space = t_meta.get("hnsw:space")
        if t_dim and s_dim and t_dim != s_dim:
            warnings.append(f"dimension mismatch: source={s_dim} target={t_dim}")
        if t_space and s_space and t_space != s_space:
            warnings.append(f"distance space mismatch: source={s_space} target={t_space}")
    except Exception:
        warnings.append("target collection does not exist yet (will be created)")

    return {
        "source_dimension": s_dim,
        "target_dimension": t_dim,
        "source_space": s_space,
        "target_space": t_space,
        "compatible": not any("mismatch" in w for w in warnings),
        "warnings": warnings,
    }


def _peek_dimension(coll) -> Optional[int]:
    got = coll.get(limit=1, include=["embeddings"])
    embs = got.get("embeddings")
    if embs is not None and len(embs) and embs[0] is not None:
        return len(embs[0])
    return None


def _ensure_workers() -> None:
    """Lazily start the fixed worker pool that drains the queue."""
    global _WORKERS_STARTED
    with _WORKERS_LOCK:
        if _WORKERS_STARTED:
            return
        for i in range(max(1, config.MAX_CONCURRENT_JOBS)):
            threading.Thread(target=_worker_loop, name=f"dump-worker-{i}",
                             daemon=True).start()
        _WORKERS_STARTED = True


def enqueue(job_id: int) -> None:
    """Queue a job. It runs when a worker is free — sequential by default."""
    _set(job_id, state="pending")
    _ensure_workers()
    _QUEUE.put(job_id)


def recover() -> None:
    """Re-enqueue jobs left 'pending' or 'running' by a previous process — e.g.
    after a backend restart or uvicorn --reload, which wipes the in-memory
    queue and worker threads while SQLite still says the job was active.
    Safe to re-run: upsert is idempotent and 'running' jobs resume from their
    checkpoint_offset. Without this, such jobs would hang forever."""
    with connect() as c:
        rows = c.execute(
            "SELECT id FROM jobs WHERE state IN ('pending', 'running') ORDER BY id"
        ).fetchall()
    for r in rows:
        enqueue(r["id"])


def cancel(job_id: int) -> None:
    """Pause a job. If running, signal it to stop; if still queued, mark it
    paused so the worker skips it when popped."""
    with _CANCELS_LOCK:
        ev = _CANCELS.get(job_id)
    if ev:
        ev.set()          # running now -> stop after current batch
    else:
        _set(job_id, state="paused")  # still waiting -> skip on pop


def _worker_loop() -> None:
    while True:
        job_id = _QUEUE.get()
        try:
            with connect() as c:
                row = c.execute("SELECT state FROM jobs WHERE id = ?", (job_id,)).fetchone()
            # Cancelled while still queued -> don't run it.
            if row is None or row["state"] == "paused":
                continue
            cancel_ev = threading.Event()
            with _CANCELS_LOCK:
                _CANCELS[job_id] = cancel_ev
            _run(job_id, cancel_ev)
        except Exception as e:  # noqa: BLE001
            # A worker thread must NEVER die — one bad job would stall the whole
            # sequential queue forever. Mark the job errored and keep draining.
            try:
                _set(job_id, state="error", error=f"worker: {e}")
            except Exception:
                pass
        finally:
            with _CANCELS_LOCK:
                _CANCELS.pop(job_id, None)
            _QUEUE.task_done()


_ALLOWED_JOB_COLS = frozenset({"state", "error", "processed", "total", "checkpoint_offset"})

def _set(job_id: int, **fields) -> None:
    unknown = set(fields) - _ALLOWED_JOB_COLS
    if unknown:
        raise ValueError(f"disallowed job columns: {unknown}")
    cols = ", ".join(f"{k} = ?" for k in fields)
    with connect() as c:
        c.execute(f"UPDATE jobs SET {cols} WHERE id = ?", (*fields.values(), job_id))


def _run(job_id: int, cancel: threading.Event) -> None:
    with connect() as c:
        job = c.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if job is None:
        return

    try:
        src_client = chroma_client.client_for(job["source_conn_id"])
        tgt_client = chroma_client.client_for(job["target_conn_id"])
        source = src_client.get_collection(job["source_collection"])

        # Auto-create target with source's metadata if missing.
        target = tgt_client.get_or_create_collection(
            job["target_collection"], metadata=source.metadata or None
        )

        where = json.loads(job["where_json"]) if job["where_json"] else None

        offset = job["checkpoint_offset"]  # resume point
        batch = job["batch_size"]

        # IDs-first strategy for both regular and filtered dumps:
        # fetch the full ID list once (include=[] → no blobs, very cheap),
        # then page by explicit ID slice.  This avoids SQLite's O(N) offset
        # scan which degrades badly at high offsets on large collections.
        if where:
            all_ids = sorted(source.get(where=where, include=[])["ids"])
        else:
            all_ids = sorted(source.get(include=[])["ids"])

        total = len(all_ids)
        _set(job_id, state="running", total=total)

        if offset >= total:
            _set(job_id, state="done", processed=total, checkpoint_offset=total)
            return

        _pipeline_copy(job_id, source, target, all_ids, offset, batch, cancel)
    except Exception as e:  # noqa: BLE001 — surface any failure to the UI
        _set(job_id, state="error", error=str(e))


# Sentinel pushed onto the queue to tell the writer the reader is finished.
_DONE = object()


def _pipeline_copy(job_id, source, target, all_ids, offset, batch,
                   cancel: threading.Event) -> None:
    """Copy all_ids[offset:] from source to target with a 2-thread pipeline.

    Reader thread: fetch one CUI_BATCH slice from the source at a time and hand
    it to a bounded queue (size CUI_PREFETCH_DEPTH → the reader runs at most that
    many batches ahead, so the weak source is never flooded).
    Writer (this thread): drain the queue, accumulate WRITE_BATCH_FACTOR batches,
    and upsert them to the (strong) target in one call — fewer round-trips.

    Checkpoint advances only after a successful target write, so a crash/pause
    resumes from the last fully-written offset (upsert is idempotent anyway)."""
    total = len(all_ids)
    q: "queue.Queue" = queue.Queue(maxsize=config.PREFETCH_DEPTH)
    stop = threading.Event()   # writer signals reader to bail on error
    errbox: dict[str, BaseException] = {}

    def reader() -> None:
        try:
            off = offset
            while off < total and not cancel.is_set() and not stop.is_set():
                slice_ids = all_ids[off:off + batch]
                page = source.get(ids=slice_ids, include=_INCLUDE)
                n = len(page["ids"])
                if n == 0:
                    break
                q.put((page, n))  # blocks here when queue is full → throttles source
                off += n
        except BaseException as e:  # noqa: BLE001 — relay to writer/main
            errbox["reader"] = e
        finally:
            q.put(_DONE)

    reader_t = threading.Thread(target=reader, name=f"dump-reader-{job_id}",
                                daemon=True)
    reader_t.start()

    written = offset
    acc: dict[str, list] = {"ids": [], "embeddings": [], "documents": [], "metadatas": []}
    flush_every = batch * config.WRITE_BATCH_FACTOR

    def flush() -> None:
        nonlocal written
        if not acc["ids"]:
            return
        kw = {"ids": acc["ids"]}
        # Only pass a field if it carries real data — a collection without
        # embeddings/documents must not get a list of Nones (upsert rejects it).
        for f in ("embeddings", "documents", "metadatas"):
            if any(v is not None for v in acc[f]):
                kw[f] = acc[f]
        target.upsert(**kw)
        written += len(acc["ids"])
        _set(job_id, processed=written, checkpoint_offset=written)
        for f in acc:
            acc[f] = []

    try:
        while True:
            item = q.get()
            if item is _DONE:
                break
            page, n = item
            acc["ids"].extend(page["ids"])
            for f in ("embeddings", "documents", "metadatas"):
                v = page.get(f)
                acc[f].extend(list(v) if v is not None else [None] * n)
            if len(acc["ids"]) >= flush_every:
                flush()
        flush()  # write whatever is left below the batch-factor threshold
    except BaseException:
        stop.set()           # tell reader to quit
        _drain(q)            # unblock a reader parked on a full queue
        raise
    finally:
        reader_t.join(timeout=5)

    if errbox:
        raise errbox["reader"]

    if cancel.is_set() and written < total:
        _set(job_id, state="paused")
    else:
        _set(job_id, state="done", processed=written, checkpoint_offset=written)


def _drain(q: "queue.Queue") -> None:
    """Empty a queue without blocking — frees a producer stuck on a full put()."""
    try:
        while True:
            q.get_nowait()
    except queue.Empty:
        pass
