"""
RAG orchestration for vendor SLA documents: chunk + embed (LLM gateway) +
store (chromadb, see vector_store.py) on upload, then retrieve top-k chunks +
generate a grounded answer (LLM gateway) on question-asking.
"""
from __future__ import annotations

import logging
import uuid

from app import observability
from app.config import SLA_RAG_CHUNK_OVERLAP, SLA_RAG_CHUNK_SIZE, SLA_RAG_TOP_K
from app.rag import vector_store
from app.rag.chunking import chunk_text
from app.rag.embeddings import embed_query, embed_texts
from app.rag.llm import answer_question

logger = logging.getLogger("erp_app.rag.sla_rag")


def _collection_name(sla_id: int) -> str:
    return f"sla_{sla_id}"


def index_sla(sla_id: int, vendor_username: str, text: str, trace_id: str | None = None) -> dict:
    """Chunk + embed + upsert an SLA document's text. Returns a status dict for logging.
    trace_id (optional): if not given, a fresh one is derived (SLA upload has no upstream
    pipeline-run context to nest under) — see app/observability.py."""
    trace_id = trace_id or observability.trace_id_for(f"sla_index_{sla_id}_{uuid.uuid4().hex}")
    collection_name = _collection_name(sla_id)
    if not text:
        return {"indexed": False, "chunk_count": 0, "error": "No SLA text to index"}

    chunks = chunk_text(text, chunk_size=SLA_RAG_CHUNK_SIZE, overlap=SLA_RAG_CHUNK_OVERLAP)
    if not chunks:
        return {"indexed": False, "chunk_count": 0, "error": "SLA text produced no chunks"}

    embeddings = embed_texts(chunks, task_type="retrieval_document", trace_id=trace_id)
    if embeddings is None:
        return {"indexed": False, "chunk_count": 0, "error": "Embedding failed (check API_ENDPOINT/API_KEY)"}

    metadatas = [{"sla_id": sla_id, "vendor_username": vendor_username, "chunk_index": i} for i in range(len(chunks))]
    vector_store.upsert_collection(collection_name, chunks, embeddings, metadatas)
    return {"indexed": True, "chunk_count": len(chunks), "error": None}


def delete_sla_index(sla_id: int) -> None:
    vector_store.delete_collection(_collection_name(sla_id))


def ask_sla(sla_id: int, question: str, top_k: int = SLA_RAG_TOP_K, trace_id: str | None = None) -> dict:
    """Retrieve relevant SLA chunks for `question` and generate a grounded answer.

    trace_id (optional): pass the caller's own trace id (e.g. an ai-app pipeline run_id,
    via app.observability.trace_id_for(run_id)) to nest this RAG call under that trace —
    see app/observability.py for why the same run_id always derives the same trace id
    even across the ai-app/erp-app process boundary. If not given, a fresh one is derived.

    Returns {answer: str | None, sources: list[str], error: str | None}.
    """
    trace_id = trace_id or observability.trace_id_for(f"sla_ask_{sla_id}_{uuid.uuid4().hex}")
    collection_name = _collection_name(sla_id)
    if vector_store.collection_count(collection_name) == 0:
        return {"answer": None, "sources": [], "error": "This SLA has not been indexed yet"}

    query_embedding = embed_query(question, trace_id=trace_id)
    if query_embedding is None:
        return {"answer": None, "sources": [], "error": "Embedding the question failed (check API_ENDPOINT/API_KEY)"}

    results = vector_store.query(collection_name, query_embedding, top_k=top_k)
    sources = results.get("documents", [])

    answer = answer_question(question, sources, trace_id=trace_id)
    if answer is None:
        return {"answer": None, "sources": sources, "error": "Answer generation failed (check API_ENDPOINT/API_KEY)"}

    return {"answer": answer, "sources": sources, "error": None}
