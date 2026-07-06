"""
Model role table — maps logical roles to concrete model names.

USE_ORG_MODELS (root .env) controls which defaults apply:
  true  → organisational LiteLLM gateway models (azure/genailab-maas-*)
  false → personal free-tier models (Gemini via Google AI + Groq)

Individual roles can still be overridden via MODEL_<ROLE> env vars regardless
of the mode — those overrides take priority over both default tables.

Endpoint routing (which base_url / api_key to use) lives in llm_client.py:
  vision + embedding → Gemini OpenAI-compat endpoint (personal mode)
  all other roles    → Groq OpenAI-compat endpoint   (personal mode)
  all roles          → org gateway                    (org mode)
"""
from __future__ import annotations

import os

_USE_ORG = os.environ.get("USE_ORG_MODELS", "true").strip().lower() not in ("false", "0", "no")

_ORG_DEFAULTS: dict[str, str] = {
    "VISION":     "gemini-2.5-flash",
    "TRANSCRIBE": "azure/genailab-maas-whisper",
    "EMBEDDING":  "azure/genailab-maas-text-embedding-3-large",
    "REASONING":  "azure_ai/Llama-3.3-70B-Instruct_Mass",
    "AGENT":      "azure/genailab-maas-gpt-4.1-mini",
    "FAST_SLM":   "azure/genailab-maas-gpt-4.1-nano",
    "CHAT":       "azure/genailab-maas-gpt-4.1",
    "TRANSLATE":  "azure/genailab-maas-gpt-4.1-nano",
}

_PERSONAL_DEFAULTS: dict[str, str] = {
    # Gemini free-tier (routed to generativelanguage.googleapis.com)
    "VISION":     "gemini-2.5-flash",
    "EMBEDDING":  os.environ.get("GEMINI_EMBEDDING_MODEL", "models/gemini-embedding-001"),
    # Groq free-tier (routed to api.groq.com)
    "TRANSCRIBE": "whisper-large-v3",
    "REASONING":  "llama-3.3-70b-versatile",
    "AGENT":      "llama-3.1-8b-instant",
    "FAST_SLM":   "llama-3.1-8b-instant",
    "CHAT":       "llama-3.3-70b-versatile",
    "TRANSLATE":  "llama-3.1-8b-instant",
}

_DEFAULTS = _ORG_DEFAULTS if _USE_ORG else _PERSONAL_DEFAULTS

# Apply MODEL_<ROLE> env-var overrides on top of whichever default table is active
MODELS: dict[str, str] = {
    key: os.environ.get(f"MODEL_{key}", default)
    for key, default in _DEFAULTS.items()
}

# Extra vision candidates tried on transient/overload errors (inspector agent).
# Org mode: no fallbacks — only the gateway model is valid.
# Personal mode: gemini-2.5-flash-lite only; gemini-2.5-pro excluded (free-tier daily quota exhausted).
VISION_FALLBACKS: list[str] = [] if _USE_ORG else ["gemini-2.5-flash-lite"]


def get_model(role: str) -> str:
    """Resolve a logical role (case-insensitive) to a concrete model name."""
    key = role.upper()
    if key not in MODELS:
        raise KeyError(f"Unknown model role '{role}'. Known roles: {list(MODELS.keys())}")
    return MODELS[key]
