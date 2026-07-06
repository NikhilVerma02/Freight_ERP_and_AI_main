"""Shared result envelope for provider clients (gemini_client, groq_client) —
same shape as the legacy app/llm_client.py envelope so orchestrator.py's
logging code (model/latency/tokens) works unchanged regardless of provider."""
from __future__ import annotations

from typing import Any


def envelope(
    model: str,
    latency_ms: float,
    status: str,
    content: Any = None,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    error: str | None = None,
) -> dict:
    return {
        "model": model,
        "latency_ms": round(latency_ms, 2),
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "status": status,
        "error": error,
        "content": content,
    }
