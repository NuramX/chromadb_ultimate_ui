# Chroma Ultimate UI

DBeaver-style web UI for ChromaDB — browse collections and copy them between
servers. See [PROJECT.md](PROJECT.md) for design.

## Quick start (local dev)

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --port 8080
```

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

### Or docker-compose (backend + frontend + 2 demo chroma servers)

```bash
docker compose up
```

## Status

Scaffold / M1 in progress. See roadmap in [PROJECT.md](PROJECT.md).
