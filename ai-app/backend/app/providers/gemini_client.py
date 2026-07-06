"""
Multimodal client — used exclusively by the Inspector Agent to understand
uploaded video/image/audio evidence of freight damage in a single call.
Routed through the organisation's LLM gateway (API_ENDPOINT/API_KEY, see
app/llm_client.py); model resolved via the "vision" role in
app/config/models.py (a Gemini model on the gateway, since it natively
accepts inline video/image/audio parts in one request).

The free tier of the underlying model intermittently returns 503
UNAVAILABLE ("high demand") with no actual problem on our end — retried
with backoff, then failed over to the next candidate model, before giving up.
"""
from __future__ import annotations

import base64
import logging
import time

from app import observability
from app.config.models import VISION_FALLBACKS, get_model
from app.llm_client import llm_client
from app.providers import envelope

logger = logging.getLogger("ai_app.providers.vision")

_RETRYABLE_MARKERS = ("503", "UNAVAILABLE", "RESOURCE_EXHAUSTED", "429")


def _is_retryable(exc: Exception) -> bool:
    text = str(exc)
    return any(marker in text for marker in _RETRYABLE_MARKERS)


def multimodal_extract(system_prompt: str, user_text: str, files: list[dict], trace_id: str | None = None) -> dict:
    """files: list of {"data": bytes, "mime_type": str}. Returns a provider envelope
    whose `content` is the model's raw text response on success.
    trace_id (optional): Langfuse trace to nest this call under — see app/observability.py."""
    primary_model = get_model("vision")
    active_client = llm_client._client_for("vision")
    if active_client is None:
        return envelope(primary_model, 0.0, "error", error="LLM gateway not configured (missing API_ENDPOINT/API_KEY)")

    content_blocks: list[dict] = [{"type": "text", "text": user_text}]
    for f in files:
        b64 = base64.b64encode(f["data"]).decode("ascii")
        content_blocks.append({"type": "image_url", "image_url": {"url": f"data:{f['mime_type']};base64,{b64}"}})
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": content_blocks},
    ]

    generation = observability.start_generation(
        trace_id,
        "vision_multimodal_extract",
        primary_model,
        input={"system_prompt": system_prompt, "user_text": user_text, "file_count": len(files)},
    )

    candidates = [primary_model] + [m for m in VISION_FALLBACKS if m != primary_model]
    last_error: Exception | None = None
    overall_start = time.perf_counter()

    for model in candidates:
        # One retry per model (transient overload often clears in a couple seconds),
        # then move on to the next candidate model rather than retrying it forever.
        for attempt in range(2):
            try:
                resp = active_client.chat.completions.create(model=model, messages=messages, temperature=0)
                latency_ms = (time.perf_counter() - overall_start) * 1000
                content = resp.choices[0].message.content if resp.choices else None
                usage = getattr(resp, "usage", None)
                prompt_tokens = getattr(usage, "prompt_tokens", None) if usage else None
                completion_tokens = getattr(usage, "completion_tokens", None) if usage else None
                observability.finish_generation(
                    generation, output=content, status="ok", usage={"input": prompt_tokens, "output": completion_tokens}
                )
                return envelope(model, latency_ms, "ok", content, prompt_tokens, completion_tokens)
            except Exception as exc:
                last_error = exc
                if not _is_retryable(exc):
                    logger.error("multimodal_extract: non-retryable error on model %s: %s", model, exc)
                    break  # don't bother retrying/falling over for a non-transient error (e.g. bad input)
                logger.warning("multimodal_extract: model %s attempt %d failed (%s)", model, attempt + 1, exc)
                if attempt == 0:
                    time.sleep(1.5)
        else:
            continue  # both attempts retryable-failed for this model — try the next model
        if not _is_retryable(last_error):
            break  # non-retryable: stop trying other models too

    latency_ms = (time.perf_counter() - overall_start) * 1000
    logger.error("multimodal_extract failed on all candidate models: %s", last_error)
    observability.finish_generation(generation, status="error", error=str(last_error))
    return envelope(primary_model, latency_ms, "error", error=str(last_error))
