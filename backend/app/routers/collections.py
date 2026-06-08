"""Browse collections + paginated record table (DBeaver-style grid)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from .. import chroma_client
from ..models import CollectionCreate, CollectionInfo, CollectionRename, RecordsPage

router = APIRouter(prefix="/connections/{conn_id}/collections", tags=["collections"])

_PREVIEW_DIMS = 8  # embedding floats shown in the table cell


@router.post("")
def create_collection(conn_id: int, body: CollectionCreate):
    try:
        chroma_client.client_for(conn_id).create_collection(
            body.name, metadata={"hnsw:space": body.space})
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(e))


@router.patch("/{name}")
def rename_collection(conn_id: int, name: str, body: CollectionRename):
    try:
        coll = chroma_client.client_for(conn_id).get_collection(name)
        coll.modify(name=body.new_name)
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(e))


@router.delete("/{name}")
def delete_collection(conn_id: int, name: str):
    try:
        chroma_client.client_for(conn_id).delete_collection(name)
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(e))


@router.get("", response_model=list[CollectionInfo])
def list_collections(conn_id: int):
    try:
        client = chroma_client.client_for(conn_id)
        out = []
        for coll in client.list_collections():
            c = client.get_collection(coll.name)
            dim = None
            peek = c.get(limit=1, include=["embeddings"])
            embs = peek.get("embeddings")
            if embs is not None and len(embs) and embs[0] is not None:
                dim = len(embs[0])
            out.append(CollectionInfo(
                name=c.name, id=str(c.id), count=c.count(),
                metadata=c.metadata, dimension=dim,
            ))
        return out
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{name}/records", response_model=RecordsPage)
def get_records(conn_id: int, name: str,
                offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=500)):
    try:
        coll = chroma_client.client_for(conn_id).get_collection(name)
        total = coll.count()
        page = coll.get(limit=limit, offset=offset,
                        include=["documents", "embeddings", "metadatas"])
        # Chroma get() has no guaranteed order — sort by id so the table is
        # stable across repeated fetches of the same page.
        raw_ids = page["ids"]
        raw_docs = page.get("documents") or [None] * len(raw_ids)
        raw_metas = page.get("metadatas") or [None] * len(raw_ids)
        raw_embs = page.get("embeddings")
        raw_embs_list = list(raw_embs) if raw_embs is not None else [None] * len(raw_ids)

        order = sorted(range(len(raw_ids)), key=lambda i: raw_ids[i])
        ids   = [raw_ids[i]       for i in order]
        docs  = [raw_docs[i]      for i in order]
        metas = [raw_metas[i]     for i in order]
        embs  = [raw_embs_list[i] for i in order]

        n = len(ids)

        preview = [
            (list(e[:_PREVIEW_DIMS]) if e is not None else None) for e in embs
        ]

        return RecordsPage(
            ids=ids,
            documents=docs,
            metadatas=metas,
            embeddings_preview=preview,
            offset=offset, limit=limit, total=total,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(e))
