"""Pydantic request/response schemas."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from . import config


class ConnectionIn(BaseModel):
    name: str
    host: str = "localhost"
    port: int = 8000
    ssl: bool = False
    tenant: str = "default_tenant"
    database: str = "default_database"
    token: str = ""  # auth bearer token; write-only, encrypted at rest


class ConnectionOut(BaseModel):
    id: int
    name: str
    host: str
    port: int
    ssl: bool
    tenant: str
    database: str
    has_token: bool  # never return the token itself


class CollectionCreate(BaseModel):
    name: str
    space: str = "cosine"  # hnsw:space — cosine | l2 | ip


class CollectionRename(BaseModel):
    new_name: str


class CollectionInfo(BaseModel):
    name: str
    id: str
    count: int
    metadata: Optional[dict[str, Any]] = None
    dimension: Optional[int] = None


class FieldInfo(BaseModel):
    name: str
    type: str  # str | int | float | bool — inferred from sampled records


class RecordsQuery(BaseModel):
    where: Optional[dict[str, Any]] = None  # chromadb metadata filter
    offset: int = 0
    limit: int = 50


class RecordsPage(BaseModel):
    ids: list[str]
    documents: list[Optional[str]]
    metadatas: list[Optional[dict[str, Any]]]
    embeddings_preview: list[Optional[list[float]]]  # truncated for table view
    offset: int
    limit: int
    total: int


class MigrateRequest(BaseModel):
    source_connection_id: int
    target_connection_id: int
    source_collection: str
    target_collection: Optional[str] = None  # default: same name
    batch_size: int = Field(default=config.DEFAULT_BATCH, ge=1, le=10000)
    create_if_missing: bool = True
    where: Optional[dict[str, Any]] = None  # dump only records matching this filter


class MigrateBatchRequest(BaseModel):
    """Dump several collections in one go — they are queued and run one at a
    time (sequential), never in parallel, to spare the weak source server."""
    source_connection_id: int
    target_connection_id: int
    source_collections: list[str]
    batch_size: int = Field(default=config.DEFAULT_BATCH, ge=1, le=10000)
    create_if_missing: bool = True


class JobStatus(BaseModel):
    id: int
    state: Literal["pending", "running", "paused", "done", "error"]
    source_conn_id: int
    target_conn_id: int
    source_collection: str
    target_collection: str
    total: int
    processed: int
    checkpoint_offset: int
    error: Optional[str] = None


class CompatReport(BaseModel):
    source_dimension: Optional[int]
    target_dimension: Optional[int]
    source_space: Optional[str]
    target_space: Optional[str]
    compatible: bool
    warnings: list[str]
