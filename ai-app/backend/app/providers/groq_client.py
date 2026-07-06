"""
Text-reasoning client — used by every text-only agent in the pipeline
(Context Structuring, Policy, Reorder, Claim, Governance). Routed through the
organisation's LLM gateway (API_ENDPOINT/API_KEY, see app/llm_client.py),
model resolved via the "reasoning" role in app/config/models.py.
"""
from __future__ import annotations

import logging
import time

from app import observability
from app.config.models import get_model
from app.llm_client import llm_client
from app.providers import envelope

logger = logging.getLogger("ai_app.providers.reasoning")


def reasoning_chat(
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0,
    trace_id: str | None = None,
    name: str = "reasoning_chat",
) -> dict:
    """Single-turn system+user chat completion. Returns a provider envelope
    whose `content` is the model's raw text response on success.
    trace_id (optional): Langfuse trace to nest this call under — see app/observability.py.
    name: distinguishes this call site in the trace (e.g. "policy_reasoning", "claim_draft")."""
    model = get_model("reasoning")
    active_client = llm_client._client_for("reasoning")
    if active_client is None:
        return envelope(model, 0.0, "error", error="LLM gateway not configured (missing API_ENDPOINT/API_KEY)")

    generation = observability.start_generation(
        trace_id, name, model, input={"system": system_prompt, "user": user_prompt}
    )
    start = time.perf_counter()
    try:
        resp = active_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
        )
        latency_ms = (time.perf_counter() - start) * 1000
        content = resp.choices[0].message.content if resp.choices else None
        usage = getattr(resp, "usage", None)
        prompt_tokens = getattr(usage, "prompt_tokens", None) if usage else None
        completion_tokens = getattr(usage, "completion_tokens", None) if usage else None
        observability.finish_generation(
            generation, output=content, status="ok", usage={"input": prompt_tokens, "output": completion_tokens}
        )
        return envelope(model, latency_ms, "ok", content, prompt_tokens, completion_tokens)
    except Exception as exc:
        latency_ms = (time.perf_counter() - start) * 1000
        logger.error("reasoning_chat failed: %s", exc)
        observability.finish_generation(generation, status="error", error=str(exc))
        return envelope(model, latency_ms, "error", error=str(exc))
