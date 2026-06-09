"""Browse collections + paginated record table (DBeaver-style grid)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from .. import chroma_client
from ..models import (
    CollectionCreate, CollectionInfo, CollectionRename,
    DeleteRecordsRequest, FieldInfo, RecordsPage, RecordsQuery,
)

router = APIRouter(prefix="/connections/{conn_id}/collections", tags=["collections"])

_PREVIEW_DIMS = 8  # embedding floats shown in the table cell
_FIELD_SAMPLE = 500  # records sampled to discover metadata field names


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


@router.get("/{name}/fields", response_model=list[FieldInfo])
def metadata_fields(conn_id: int, name: str):
    """Discover metadata field names + inferred types by sampling records.
    Feeds the filter builder's field dropdown."""
    try:
        coll = chroma_client.client_for(conn_id).get_collection(name)
        sample = coll.get(limit=_FIELD_SAMPLE, include=["metadatas"])
        types: dict[str, str] = {}
        for meta in (sample.get("metadatas") or []):
            if not meta:
                continue
            for k, v in meta.items():
                if k in types:
                    continue
                if isinstance(v, bool):
                    types[k] = "bool"
                elif isinstance(v, int):
                    types[k] = "int"
                elif isinstance(v, float):
                    types[k] = "float"
                else:
                    types[k] = "str"
        return [FieldInfo(name=k, type=t) for k, t in sorted(types.items())]
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(e))


def _build_page(coll, where, offset, limit) -> RecordsPage:
    include = ["documents", "embeddings", "metadatas"]
    if where:
        # No count(where) in Chroma — fetch matching ids once for an accurate
        # total, then pull full data for just the requested page.
        all_ids = sorted(coll.get(where=where, include=[])["ids"])
        total = len(all_ids)
        page_ids = all_ids[offset:offset + limit]
        page = coll.get(ids=page_ids, include=include) if page_ids else {"ids": []}
    else:
        total = coll.count()
        page = coll.get(limit=limit, offset=offset, include=include)

    raw_ids = page["ids"]
    raw_docs = page.get("documents") or [None] * len(raw_ids)
    raw_metas = page.get("metadatas") or [None] * len(raw_ids)
    raw_embs = page.get("embeddings")
    raw_embs_list = list(raw_embs) if raw_embs is not None else [None] * len(raw_ids)

    # Stable order — Chroma get() has no guaranteed order.
    order = sorted(range(len(raw_ids)), key=lambda i: raw_ids[i])
    ids = [raw_ids[i] for i in order]
    docs = [raw_docs[i] for i in order]
    metas = [raw_metas[i] for i in order]
    embs = [raw_embs_list[i] for i in order]

    preview = [(list(e[:_PREVIEW_DIMS]) if e is not None else None) for e in embs]
    return RecordsPage(
        ids=ids, documents=docs, metadatas=metas,
        embeddings_preview=preview, offset=offset, limit=limit, total=total,
    )


@router.get("/{name}/records", response_model=RecordsPage)
def get_records(conn_id: int, name: str,
                offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=500)):
    try:
        coll = chroma_client.client_for(conn_id).get_collection(name)
        return _build_page(coll, None, offset, limit)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{name}/records", response_model=RecordsPage)
def query_records(conn_id: int, name: str, body: RecordsQuery):
    """Browse with an optional metadata `where` filter."""
    try:
        coll = chroma_client.client_for(conn_id).get_collection(name)
        return _build_page(coll, body.where, body.offset, body.limit)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{name}/records/{record_id}")
def get_record(conn_id: int, name: str, record_id: str):
    """Fetch a single record with its full embedding."""
    try:
        coll = chroma_client.client_for(conn_id).get_collection(name)
        result = coll.get(ids=[record_id], include=["documents", "embeddings", "metadatas"])
        if not result["ids"]:
            raise HTTPException(status_code=404, detail="record not found")
        emb = result.get("embeddings")
        full_emb = list(emb[0]) if emb is not None and len(emb) and emb[0] is not None else None
        return {
            "id": result["ids"][0],
            "document": (result.get("documents") or [None])[0],
            "metadata": (result.get("metadatas") or [None])[0],
            "embedding": full_emb,
        }
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(e))


@router.delete("/{name}/records")
def delete_records(conn_id: int, name: str, body: DeleteRecordsRequest):
    """Delete specific records by ID from a collection."""
    if not body.ids:
        raise HTTPException(status_code=400, detail="ids must not be empty")
    try:
        coll = chroma_client.client_for(conn_id).get_collection(name)
        coll.delete(ids=body.ids)
        return {"ok": True, "deleted": len(body.ids)}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(e))
