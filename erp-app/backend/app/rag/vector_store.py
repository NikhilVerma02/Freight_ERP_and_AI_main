"""
Chromadb-backed vector store for vendor SLA document chunks. Persists under
erp-app/backend/data/vector_cache/, one collection per SLA document
(collection name = f"sla_{sla_id}"). Falls back to a pure-numpy cosine store
if chromadb is unavailable, so the rest of the app keeps working.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np

from app.store import DATA_DIR

logger = logging.getLogger("erp_app.rag.vector_store")

VECTOR_CACHE_DIR = DATA_DIR / "vector_cache"

_chroma_client = None
_USE_CHROMA = False

try:
    import chromadb

    VECTOR_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _chroma_client = chromadb.PersistentClient(path=str(VECTOR_CACHE_DIR))
    _USE_CHROMA = True
    logger.info("vector_store: using chromadb persistent client at %s", VECTOR_CACHE_DIR)
except Exception as exc:  # pragma: no cover - depends on environment
    logger.warning("vector_store: chromadb unavailable (%s) — falling back to numpy cosine store", exc)
    _USE_CHROMA = False


class _NumpyCollection:
    def __init__(self, name: str):
        self.name = name
        self.dir = VECTOR_CACHE_DIR / "numpy_fallback"
        self.dir.mkdir(parents=True, exist_ok=True)
        self.path = self.dir / f"{name}.npz"
        self.ids: list[str] = []
        self.documents: list[str] = []
        self.metadatas: list[dict] = []
        self.embeddings: np.ndarray | None = None
        self._load()

    def _load(self) -> None:
        if self.path.exists():
            data = np.load(self.path, allow_pickle=True)
            self.ids = list(data["ids"])
            self.documents = list(data["documents"])
            self.metadatas = [dict(m) for m in data["metadatas"]]
            self.embeddings = data["embeddings"]

    def _save(self) -> None:
        np.savez(
            self.path,
            ids=np.array(self.ids, dtype=object),
            documents=np.array(self.documents, dtype=object),
            metadatas=np.array(self.metadatas, dtype=object),
            embeddings=self.embeddings if self.embeddings is not None else np.zeros((0, 0)),
        )

    def count(self) -> int:
        return len(self.ids)

    def upsert(self, ids: list[str], documents: list[str], embeddings: list[list[float]], metadatas: list[dict]) -> None:
        new_emb = np.array(embeddings, dtype=float)
        if self.embeddings is None or self.embeddings.size == 0:
            self.embeddings = new_emb
        else:
            self.embeddings = np.vstack([self.embeddings, new_emb])
        self.ids.extend(ids)
        self.documents.extend(documents)
        self.metadatas.extend(metadatas)
        self._save()

    def query(self, query_embedding: list[float], top_k: int) -> dict:
        if self.embeddings is None or len(self.ids) == 0:
            return {"documents": [[]], "metadatas": [[]], "distances": [[]]}
        q = np.array(query_embedding, dtype=float)
        mat = self.embeddings
        denom = (np.linalg.norm(mat, axis=1) * np.linalg.norm(q)) + 1e-10
        sims = (mat @ q) / denom
        order = np.argsort(-sims)[:top_k]
        return {
            "documents": [[self.documents[i] for i in order]],
            "metadatas": [[self.metadatas[i] for i in order]],
            "distances": [[float(1 - sims[i]) for i in order]],
        }

    def delete_all(self) -> None:
        self.ids, self.documents, self.metadatas, self.embeddings = [], [], [], None
        if self.path.exists():
            self.path.unlink()


_numpy_collections: dict[str, _NumpyCollection] = {}


def _get_numpy_collection(name: str) -> _NumpyCollection:
    if name not in _numpy_collections:
        _numpy_collections[name] = _NumpyCollection(name)
    return _numpy_collections[name]


def collection_count(collection_name: str) -> int:
    if _USE_CHROMA:
        try:
            coll = _chroma_client.get_or_create_collection(collection_name)
            return coll.count()
        except Exception as exc:
            logger.error("chromadb collection_count failed for %s: %s", collection_name, exc)
            return 0
    return _get_numpy_collection(collection_name).count()


def upsert_collection(collection_name: str, chunks: list[str], embeddings: list[list[float]], metadatas: list[dict]) -> None:
    ids = [f"{collection_name}_{i}" for i in range(len(chunks))]
    if _USE_CHROMA:
        try:
            coll = _chroma_client.get_or_create_collection(collection_name)
            coll.upsert(ids=ids, documents=chunks, embeddings=embeddings, metadatas=metadatas)
            return
        except Exception as exc:
            logger.error("chromadb upsert failed for %s, falling back to numpy: %s", collection_name, exc)
    _get_numpy_collection(collection_name).upsert(ids, chunks, embeddings, metadatas)


def query(collection_name: str, query_embedding: list[float], top_k: int = 4) -> dict[str, Any]:
    if _USE_CHROMA:
        try:
            coll = _chroma_client.get_or_create_collection(collection_name)
            if coll.count() == 0:
                return {"documents": [], "metadatas": [], "distances": []}
            res = coll.query(query_embeddings=[query_embedding], n_results=min(top_k, coll.count()))
            return {
                "documents": res.get("documents", [[]])[0],
                "metadatas": res.get("metadatas", [[]])[0],
                "distances": res.get("distances", [[]])[0],
            }
        except Exception as exc:
            logger.error("chromadb query failed for %s, falling back to numpy: %s", collection_name, exc)
    res = _get_numpy_collection(collection_name).query(query_embedding, top_k)
    return {
        "documents": res["documents"][0],
        "metadatas": res["metadatas"][0],
        "distances": res["distances"][0],
    }


def delete_collection(collection_name: str) -> None:
    if _USE_CHROMA:
        try:
            _chroma_client.delete_collection(collection_name)
        except Exception as exc:
            logger.warning("chromadb delete_collection failed for %s: %s", collection_name, exc)
    if collection_name in _numpy_collections:
        _numpy_collections[collection_name].delete_all()
        del _numpy_collections[collection_name]
