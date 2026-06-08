"""Chroma Ultimate UI — FastAPI entrypoint."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .routers import collections, connections, migrate
from .services import migrator

app = FastAPI(title="Chroma Ultimate UI", version="0.1.0")

# Local dev tool: Vite frontend runs on 5173.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(connections.router)
app.include_router(collections.router)
app.include_router(migrate.router)


@app.on_event("startup")
def _startup() -> None:
    db.init()
    migrator.recover()  # re-enqueue jobs orphaned by a previous restart/reload


@app.get("/health")
def health():
    return {"ok": True}
