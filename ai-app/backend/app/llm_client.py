"""
Thin wrapper around the OpenAI SDK for the AI-app pipeline.

USE_ORG_MODELS (root .env) controls endpoint routing:
  true  → single org gateway client (API_ENDPOINT / API_KEY) for all roles
  false → two free-tier clients:
            • Gemini OpenAI-compat  (generativelanguage.googleapis.com) — vision + embedding
            • Groq  OpenAI-compat   (api.groq.com)                      — all other roles

Callers always use llm_client.chat(role, messages) / .vision() / .embed() /
.transcribe() — they never inspect which backend is active.
"""
from __future__ import annotations

import base64
import logging
import os
import time
from typing import Any

from openai import OpenAI

from app.config.models import get_model

logger = logging.getLogger("ai_app.llm_client")

# Roles served by the Gemini endpoint in personal mode
_GEMINI_ROLES = {"VISION", "EMBEDDING"}

_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
_GROQ_BASE_URL   = "https://api.groq.com/openai/v1"


def _envelope(model: str, latency_ms: float, status: str, content: Any = None,
              prompt_tokens: int | None = None, completion_tokens: int | None = None,
              error: str | None = None) -> dict:
    return {
        "model": model,
        "latency_ms": round(latency_ms, 2),
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "status": status,
        "error": error,
        "content": content,
    }


class LLMClient:
    def __init__(self):
        self._use_org: bool = os.environ.get("USE_ORG_MODELS", "true").strip().lower() not in ("false", "0", "no")

        if self._use_org:
            endpoint = os.environ.get("API_ENDPOINT", "")
            key      = os.environ.get("API_KEY", "")
            if endpoint and key and "your-gateway-endpoint" not in endpoint:
                self._org_client: OpenAI | None = OpenAI(base_url=endpoint, api_key=key)
            else:
                self._org_client = None
                logger.warning(
                    "LLMClient (org mode): API_ENDPOINT/API_KEY not set — "
                    "all calls will return structured errors."
                )
            self._gemini_client: OpenAI | None = None
            self._groq_client:   OpenAI | None = None
        else:
            self._org_client = None
            gemini_key = os.environ.get("GEMINI_API_KEY", "")
            groq_key   = os.environ.get("GROQ_API_KEY", "")
            self._gemini_client = OpenAI(base_url=_GEMINI_BASE_URL, api_key=gemini_key) if gemini_key else None
            self._groq_client   = OpenAI(base_url=_GROQ_BASE_URL,   api_key=groq_key)   if groq_key   else None
            if not gemini_key:
                logger.warning("LLMClient (personal mode): GEMINI_API_KEY not set — vision/embedding calls will fail.")
            if not groq_key:
                logger.warning("LLMClient (personal mode): GROQ_API_KEY not set — chat/reasoning calls will fail.")

    # ── Internal routing ───────────────────────────────────────────────────────
    def _client_for(self, role: str) -> OpenAI | None:
        """Return the right OpenAI client for the given role."""
        if self._use_org:
            return self._org_client
        return self._gemini_client if role.upper() in _GEMINI_ROLES else self._groq_client

    def _unavailable(self, role: str, reason: str = "client not configured") -> dict:
        model = get_model(role)
        return _envelope(model, 0.0, "error", error=f"LLM client unavailable ({reason})")

    # ── Public API ─────────────────────────────────────────────────────────────
    def chat(self, role: str, messages: list[dict], **kwargs) -> dict:
        """Chat completion. role maps to a model via app.config.models."""
        model = get_model(role)
        client = self._client_for(role)
        if client is None:
            return self._unavailable(role)
        start = time.perf_counter()
        try:
            resp = client.chat.completions.create(model=model, messages=messages, **kwargs)
            latency_ms = (time.perf_counter() - start) * 1000
            content = resp.choices[0].message.content if resp.choices else None
            usage = getattr(resp, "usage", None)
            return _envelope(model, latency_ms, "ok", content,
                             getattr(usage, "prompt_tokens", None) if usage else None,
                             getattr(usage, "completion_tokens", None) if usage else None)
        except Exception as exc:
            latency_ms = (time.perf_counter() - start) * 1000
            logger.error("chat() failed role=%s model=%s: %s", role, model, exc)
            return _envelope(model, latency_ms, "error", error=str(exc))

    def vision(self, role: str, image_b64_list: list[str], prompt: str, **kwargs) -> dict:
        """Multimodal vision call."""
        model = get_model(role)
        client = self._client_for(role)
        if client is None:
            return self._unavailable(role)
        start = time.perf_counter()
        try:
            content_blocks: list[dict] = [{"type": "text", "text": prompt}]
            for b64 in image_b64_list:
                url = b64 if b64.startswith("data:") else f"data:image/jpeg;base64,{b64}"
                content_blocks.append({"type": "image_url", "image_url": {"url": url}})
            messages = [{"role": "user", "content": content_blocks}]
            resp = client.chat.completions.create(model=model, messages=messages, **kwargs)
            latency_ms = (time.perf_counter() - start) * 1000
            content = resp.choices[0].message.content if resp.choices else None
            usage = getattr(resp, "usage", None)
            return _envelope(model, latency_ms, "ok", content,
                             getattr(usage, "prompt_tokens", None) if usage else None,
                             getattr(usage, "completion_tokens", None) if usage else None)
        except Exception as exc:
            latency_ms = (time.perf_counter() - start) * 1000
            logger.error("vision() failed model=%s: %s", model, exc)
            return _envelope(model, latency_ms, "error", error=str(exc))

    def embed(self, texts: list[str]) -> dict:
        """Batch embedding call. content is list[list[float]] on success."""
        model = get_model("embedding")
        client = self._client_for("embedding")
        if client is None:
            return self._unavailable("embedding")
        start = time.perf_counter()
        try:
            resp = client.embeddings.create(model=model, input=texts)
            latency_ms = (time.perf_counter() - start) * 1000
            vectors = [item.embedding for item in resp.data]
            usage = getattr(resp, "usage", None)
            return _envelope(model, latency_ms, "ok", vectors,
                             getattr(usage, "prompt_tokens", None) if usage else None, None)
        except Exception as exc:
            latency_ms = (time.perf_counter() - start) * 1000
            logger.error("embed() failed model=%s: %s", model, exc)
            return _envelope(model, latency_ms, "error", error=str(exc))

    def transcribe(self, audio_file_path: str) -> dict:
        """Audio transcription."""
        model = get_model("transcribe")
        client = self._client_for("transcribe")
        if client is None:
            return self._unavailable("transcribe")
        start = time.perf_counter()
        try:
            with open(audio_file_path, "rb") as f:
                resp = client.audio.transcriptions.create(model=model, file=f)
            latency_ms = (time.perf_counter() - start) * 1000
            text = getattr(resp, "text", None) or (resp.get("text") if isinstance(resp, dict) else None)
            return _envelope(model, latency_ms, "ok", text)
        except Exception as exc:
            latency_ms = (time.perf_counter() - start) * 1000
            logger.error("transcribe() failed model=%s: %s", model, exc)
            return _envelope(model, latency_ms, "error", error=str(exc))


def image_path_to_b64(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")


# Module-level singleton — constructed at import time so env vars are read once.
llm_client = LLMClient()
