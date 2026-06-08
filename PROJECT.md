# Chroma Ultimate UI

DBeaver-style web GUI for ChromaDB. Browse collections + copy collections across
different Chroma servers (migration / dump).

## Why

ChromaDB has no convenient GUI for moving data between two servers. Doing it by
hand means writing one-off Python scripts every time. This tool makes it a
point-and-click operation with saved connections, just like DBeaver does for SQL.

## Decided scope (interview)

| Question        | Answer                                                       |
|-----------------|--------------------------------------------------------------|
| Chroma type     | **Chroma Server (HTTP)** — host / port / auth token          |
| Core features   | **Copy collection across DBs** + **Browse / query data**     |
| Stack           | **FastAPI (Python) backend + React/Vite frontend**           |
| Scale           | **> 1M vectors** → batched streaming, resumable, progress    |
| Connections     | **Save many connections** (DBeaver-style sidebar), persisted |
| Deploy          | **Local dev tool** (docker-compose / run locally)            |

## Architecture

```
┌──────────────┐    REST + SSE     ┌─────────────────┐   chromadb.HttpClient   ┌────────────┐
│ React (Vite) │ ───────────────▶  │ FastAPI backend │ ─────────────────────▶  │ Chroma srv │ (source)
│  DBeaver-ish │ ◀───────────────  │                 │ ─────────────────────▶  │ Chroma srv │ (target)
│     UI       │   progress stream │  + SQLite store │                          └────────────┘
└──────────────┘                   └─────────────────┘
```

- **Connection store**: local SQLite. Saves `name, host, port, ssl, tenant,
  database, token`. Token at-rest: encrypted (Fernet) with a local key.
- **Browse**: list collections → table view of records (id / document /
  metadata / embedding preview), paginated via `collection.get(limit, offset)`.
- **Migration engine**: background job, reads source in batches
  (`get(include=[documents,embeddings,metadatas], limit, offset)`), `upsert`s
  into target in batches. Idempotent by id → safe to **resume**. Progress +
  checkpoint persisted in SQLite `jobs` table; UI polls / SSE.

## Migration design for >1M

- **Sequential queue**: all dump jobs go through one FIFO queue drained by a
  worker pool sized `MAX_CONCURRENT_JOBS` (default **1**). Selecting many
  collections enqueues many jobs that run **one at a time, back-to-back** —
  never in parallel, so the weak source server is never hit by concurrent
  copies. Tunable via env `CUI_MAX_CONCURRENT_JOBS` for a future stronger host.
- Stream in pages of `BATCH` (default **50**, env `CUI_BATCH` / edit config).
  Small on purpose — weak host. Bump it after a hardware upgrade. Never load
  whole collection.
- `upsert` (not `add`) so re-running skips/overwrites — resume = restart from
  last checkpoint offset.
- Pre-flight compat check: source vs target embedding **dimension** and
  **distance function** (hnsw:space metadata). Warn before copy.
- Auto-create target collection with same metadata if missing.
- Job survives backend restart (state in SQLite); `POST /jobs/{id}/resume`.

## Layout

```
backend/   FastAPI app, SQLite store, chroma client, migration engine
frontend/  React + Vite, connection sidebar, table browser, migrate wizard
docker-compose.yml   backend + frontend + 2 demo chroma servers for testing
```

## Roadmap

- M1 — connections CRUD + browse collections (table view)
- M2 — single collection copy across DBs, batched + progress bar
- M3 — resume, compat pre-flight check, query/filter UI
- M4 — backup/restore to file (parquet/jsonl) — *future, not in v1*
