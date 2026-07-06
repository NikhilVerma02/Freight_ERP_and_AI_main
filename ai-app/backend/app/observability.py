"""
LLM call tracing via Langfuse Cloud (free tier) — entirely optional. If
LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY aren't set, every function here is a
no-op (mirrors the "never raise, just degrade" philosophy already used by
every provider client in this codebase).

Usage pattern — one trace per pipeline run:

    trace_id = observability.trace_id_for(run_id)          # deterministic
    gen = observability.start_generation(trace_id, "gemini_extract", model, input=...)
    ... do the real work ...
    observability.finish_generation(gen, output=..., status="ok", usage={...})

trace_id_for() derives a stable Langfuse trace id from any string seed via
Langfuse's own create_trace_id(seed=...) — deterministic hashing means
ai-app and erp-app can independently derive the SAME trace id from the same
run_id without ever needing to share Langfuse-internal identifiers over the
MCP wire. That's what makes the Policy Agent's SLA RAG calls (which actually
execute inside erp-app, via MCP) show up nested under the SAME trace as the
rest of that pipeline run, despite happening in a different process/service
— pass trace_id=run_id all the way through orchestrator -> policy_agent ->
mcp_client.ask_vendor_sla -> the MCP tool call -> erp-app's own
observability.trace_id_for(run_id), which derives the identical trace id.
"""
from __future__ import annotations

import logging
from typing import Any

from app.config.agents import LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY

logger = logging.getLogger("ai_app.observability")

_client = None
_unavailable_logged = False


def _get_client():
    global _client, _unavailable_logged
    if not LANGFUSE_PUBLIC_KEY or not LANGFUSE_SECRET_KEY:
        if not _unavailable_logged:
            logger.info("observability: LANGFUSE_PUBLIC_KEY/SECRET_KEY not set — tracing disabled")
            _unavailable_logged = True
        return None
    if _client is None:
        from langfuse import Langfuse

        _client = Langfuse(public_key=LANGFUSE_PUBLIC_KEY, secret_key=LANGFUSE_SECRET_KEY, host=LANGFUSE_HOST)
    return _client


def trace_id_for(seed: str) -> str | None:
    """Deterministic Langfuse trace id from any stable seed (e.g. a run_id) —
    same seed always maps to the same trace, even across processes/services."""
    client = _get_client()
    if client is None:
        return None
    try:
        return client.create_trace_id(seed=seed)
    except Exception as exc:
        logger.warning("observability: create_trace_id failed: %s", exc)
        return None


def start_trace(trace_id: str, name: str, metadata: dict | None = None, input: Any = None) -> None:
    """Creates/updates the root trace with run-level metadata. Safe to call even if
    tracing is disabled (no-op)."""
    client = _get_client()
    if client is None:
        return
    try:
        span = client.start_observation(trace_context={"trace_id": trace_id}, name=name, as_type="span", input=input, metadata=metadata)
        span.end()
    except Exception as exc:
        logger.warning("observability: start_trace failed: %s", exc)


def start_generation(trace_id: str | None, name: str, model: str, input: Any = None) -> Any:
    """Returns an opaque handle to pass to finish_generation(), or None if tracing
    is disabled/unavailable — every caller must tolerate a None handle."""
    if trace_id is None:
        return None
    client = _get_client()
    if client is None:
        return None
    try:
        return client.start_observation(
            trace_context={"trace_id": trace_id},
            name=name,
            as_type="generation",
            input=input,
            model=model,
        )
    except Exception as exc:
        logger.warning("observability: start_generation('%s') failed: %s", name, exc)
        return None


def finish_generation(
    generation: Any,
    output: Any = None,
    status: str = "ok",
    error: str | None = None,
    usage: dict | None = None,
) -> None:
    if generation is None:
        return
    try:
        generation.update(
            output=output,
            usage_details=usage or {},
            level="ERROR" if status != "ok" else "DEFAULT",
            status_message=error,
        )
        generation.end()
    except Exception as exc:
        logger.warning("observability: finish_generation failed: %s", exc)


def flush() -> None:
    client = _get_client()
    if client is None:
        return
    try:
        client.flush()
    except Exception as exc:
        logger.warning("observability: flush failed: %s", exc)
