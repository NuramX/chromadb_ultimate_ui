# Chroma Ultimate UI

DBeaver-style web GUI for [ChromaDB](https://www.trychroma.com/) — browse collections across multiple servers simultaneously and dump/copy data between ChromaDB instances.

---

## Features

| Category | What it does |
|---|---|
| **Multi-connection** | Connect to many ChromaDB servers at once; each shows its own collection tree |
| **Browse records** | Double-click any collection to page through its records (id / document / metadata / embedding) |
| **Record detail** | Click a row to open a full-detail modal including the complete embedding vector |
| **Delete records** | Checkbox multi-select across pages → bulk delete; or delete from the detail modal |
| **Metadata filter** | Visual filter builder — pick fields from a sampled dropdown or type field names manually; supports `=`, `≠`, `>`, `≥`, `<`, `≤`, `in`, `not in` per field type |
| **Dump / copy** | Copy a collection from one ChromaDB server to another with resume-safe checkpointing |
| **Filtered dump** | Apply a metadata filter first, then dump only the matching records |
| **Batch queue** | All dump jobs run sequentially (one at a time) so a weak source server is never overloaded |
| **Job history** | Global jobs panel with live progress bar, pause / resume, and clear-finished |
| **Collection CRUD** | Create, rename, and delete collections via right-click context menu |
| **Connection CRUD** | Save, edit, rename, and delete connections; auth tokens encrypted at rest |

---

## Quick start

### Option A — one command (recommended)

```bash
make dev
```

First run auto-creates a Python venv and installs npm deps. Ctrl+C stops both servers.

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8080 |
| API docs | http://localhost:8080/docs |

### Option B — run separately

```bash
# Terminal 1 — backend
make backend

# Terminal 2 — frontend
make frontend
```

### Option C — Docker Compose (backend + frontend + 2 demo Chroma servers)

```bash
docker compose up
```

Spins up `chroma-a` (port 8001) and `chroma-b` (port 8002) so you can test dumps between them right away.

---

## Configuration

All settings are environment variables — no config file needed.

| Variable | Default | Description |
|---|---|---|
| `CUI_BATCH` | `100` | Records fetched/written per batch during a dump |
| `CUI_MAX_CONCURRENT_JOBS` | `1` | Max parallel dump jobs (keep at 1 for weak servers) |
| `CUI_DATA_DIR` | `~/.chroma_ultimate_ui` | Where SQLite DB and encryption key are stored |

Example — larger batches for a fast server:

```bash
CUI_BATCH=500 make dev
```

---

## Production dumps (no auto-reload)

`make dev` uses `--reload` which restarts the backend on every file save. A restart mid-dump kills the in-memory worker thread. Use `make serve` for long-running dumps:

```bash
make serve      # backend only, no --reload
make frontend   # frontend in a second terminal
```

Dumps are resume-safe: each batch is checkpointed in SQLite, so if the server does restart you can hit **Resume** in the jobs panel and it picks up from the last checkpoint.

---

## How dumps work

1. Source collection is read in pages of `CUI_BATCH` records (`get(limit, offset)` — never loads everything into memory).
2. Each page is written to the target with `upsert` (idempotent — safe to re-run).
3. Progress and checkpoint offset are saved to SQLite after every batch.
4. Jobs are queued in a FIFO queue and run one at a time (single worker thread).
5. On startup, any `pending` or `running` jobs from a previous session are automatically re-queued.

For a **filtered dump**, matching record IDs are resolved upfront via `get(where=..., include=[])`, then pages are fetched by ID slice — so the filter is applied once, not per batch.

---

## Project layout

```
chroma_ultimate_ui/
├── backend/
│   └── app/
│       ├── main.py             # FastAPI app, startup hooks
│       ├── config.py           # Env vars, Fernet encryption
│       ├── db.py               # SQLite schema + migrations
│       ├── models.py           # Pydantic request/response schemas
│       ├── chroma_client.py    # Per-connection ChromaDB client cache
│       ├── routers/
│       │   ├── connections.py  # CRUD for saved connections
│       │   ├── collections.py  # Browse, filter, CRUD, delete records
│       │   └── migrate.py      # Dump job lifecycle
│       └── services/
│           └── migrator.py     # Worker thread, batch loop, resume logic
├── frontend/
│   └── src/
│       ├── App.tsx             # Main layout, sidebar tree, record table
│       ├── FilterBar.tsx       # Metadata filter builder (auto + manual mode)
│       ├── FilteredDumpDialog.tsx
│       ├── JobsPanel.tsx       # Live job list with progress bars
│       ├── MigratePanel.tsx    # Dump dialog
│       ├── ConnectionForm.tsx  # Add / edit connection form
│       └── api.ts              # Typed fetch client
├── docker-compose.yml
└── Makefile
```

---

## Connecting to a ChromaDB server

1. Click **+** in the top-left toolbar → fill in host, port, and optional bearer token.
2. Click the connection row to connect and load its collections.
3. Right-click the connection for: Disconnect / Refresh / New collection / Copy collections / Rename / Delete.

Auth tokens are encrypted with Fernet before being stored in the local SQLite database and are never returned to the frontend.

---

## Metadata filter

The filter bar appears above the record table after opening a collection.

- **Auto mode** — field names and types are discovered by sampling up to 500 records. Pick a field from the dropdown.
- **Manual mode** (checkbox) — type the exact field name and pick its type (`str` / `int` / `float` / `bool`). Use this when the 500-row sample might miss rare fields.

Multiple conditions are combined with `$and`. Clicking **Dump filtered…** starts a dump job that copies only the matched records.

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Python · FastAPI · ChromaDB client · SQLite · Fernet encryption |
| Frontend | React · TypeScript · Vite |
| Storage | SQLite (`~/.chroma_ultimate_ui/store.db`) — connections + job history |
