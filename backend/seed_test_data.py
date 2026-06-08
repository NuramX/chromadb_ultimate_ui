"""Seed the local test Chroma (port 8011) with sample collections so the
dump/migration flow can be tested end-to-end without touching prod.

Run:  .venv/bin/python seed_test_data.py
"""
from __future__ import annotations

import chromadb

SRC_HOST, SRC_PORT = "localhost", 8011

# (collection_name, n_docs, dim)
SPEC = [
    ("test_news_feed", 120, 8),
    ("test_reports", 40, 8),
    ("test_empty", 0, 8),
]


def fake_embedding(seed: int, dim: int) -> list[float]:
    # deterministic pseudo-vector, no model needed
    return [((seed * (j + 1)) % 97) / 97.0 for j in range(dim)]


def main() -> None:
    client = chromadb.HttpClient(host=SRC_HOST, port=SRC_PORT)
    print("heartbeat:", client.heartbeat())

    for name, n, dim in SPEC:
        try:
            client.delete_collection(name)
        except Exception:
            pass
        coll = client.create_collection(name, metadata={"hnsw:space": "cosine"})
        if n == 0:
            print(f"  {name}: created empty")
            continue
        coll.add(
            ids=[f"{name}-{i}" for i in range(n)],
            embeddings=[fake_embedding(i + 1, dim) for i in range(n)],
            documents=[f"sample document {i} in {name}" for i in range(n)],
            metadatas=[{"idx": i, "kind": name, "even": i % 2 == 0} for i in range(n)],
        )
        print(f"  {name}: added {coll.count()} docs (dim={dim})")

    print("\nSource collections:", [c.name for c in client.list_collections()])
    print("Seed done. Source = localhost:8011  Target = localhost:8012 (empty)")


if __name__ == "__main__":
    main()
