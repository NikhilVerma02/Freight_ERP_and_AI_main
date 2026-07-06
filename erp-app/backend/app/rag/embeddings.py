"""
Embedding provider. Endpoint and model are resolved by app.config based on
USE_ORG_MODELS:
  true  → organisational LiteLLM gateway  (EMBED_ENDPOINT / EMBED_KEY)
  false → Gemini free-tier OpenAI-compat  (generativelanguage.googleapis.com)
"""
from __future__ import annotations

import logging

from app import observability
from app.config import EMBED_ENDPOINT, EMBED_KEY, RAG_EMBEDDING_MODEL

logger = logging.getLogger("erp_app.rag.embeddings")

_client = None


def _get_client():
    global _client
    if not EMBED_ENDPOINT or not EMBED_KEY:
        return None
    if _client is None:
        from openai import OpenAI
        _client = OpenAI(base_url=EMBED_ENDPOINT, api_key=EMBED_KEY)
    return _client


def embed_texts(texts: list[str], task_type: str = "RETRIEVAL_DOCUMENT", trace_id: str | None = None) -> list[list[float]] | None:
    """Embed a batch of texts. Returns None on any failure."""
    if not texts:
        return []
    client = _get_client()
    if client is None:
        logger.warning("embeddings: EMBED_ENDPOINT/EMBED_KEY not set — cannot embed")
        return None

    generation = observability.start_generation(
        trace_id, f"embed_{task_type.lower()}", RAG_EMBEDDING_MODEL, input={"texts": texts}
    )
    try:
        resp = client.embeddings.create(model=RAG_EMBEDDING_MODEL, input=texts)
        vectors = [item.embedding for item in resp.data]
        observability.finish_generation(generation, output={"vector_count": len(vectors)}, status="ok")
        return vectors
    except Exception as exc:
        logger.error("embeddings: embed failed: %s", exc)
        observability.finish_generation(generation, status="error", error=str(exc))
        return None


def embed_query(text: str, trace_id: str | None = None) -> list[float] | None:
    vectors = embed_texts([text], task_type="RETRIEVAL_QUERY", trace_id=trace_id)
    return vectors[0] if vectors else None
