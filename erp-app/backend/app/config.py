"""
Central config for the ERP backend. All values sourced from the root .env.

USE_ORG_MODELS controls which LLM provider is used at runtime:
  true  → organisational LiteLLM-style gateway (API_ENDPOINT / API_KEY)
  false → personal free-tier: Gemini for embeddings, Groq for chat

Downstream modules (rag/embeddings.py, rag/llm.py, chatbot.py) import the
resolved EMBED_* and CHAT_* constants — they never inspect USE_ORG_MODELS
directly, so swapping providers requires no code changes, only a .env edit.
"""
from __future__ import annotations

import os

# ── Mode switch ────────────────────────────────────────────────────────────────
USE_ORG_MODELS: bool = os.environ.get("USE_ORG_MODELS", "true").strip().lower() not in ("false", "0", "no")

# ── Org gateway ────────────────────────────────────────────────────────────────
API_ENDPOINT: str = os.environ.get("API_ENDPOINT", "")
API_KEY: str = os.environ.get("API_KEY", "")

# ── Personal free-tier ─────────────────────────────────────────────────────────
_GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")
_GEMINI_EMBEDDING_MODEL: str = os.environ.get("GEMINI_EMBEDDING_MODEL", "models/gemini-embedding-001")
_GROQ_API_KEY: str = os.environ.get("GROQ_API_KEY", "")

# Gemini OpenAI-compatible endpoint (supports both chat/vision and embeddings)
_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
# Groq OpenAI-compatible endpoint
_GROQ_BASE_URL = "https://api.groq.com/openai/v1"

# ── Resolved endpoints ─────────────────────────────────────────────────────────
# Embeddings (RAG indexing + query)
if USE_ORG_MODELS:
    EMBED_ENDPOINT: str = API_ENDPOINT
    EMBED_KEY: str = API_KEY
    RAG_EMBEDDING_MODEL: str = os.environ.get("RAG_EMBEDDING_MODEL", "azure/genailab-maas-text-embedding-3-large")
else:
    EMBED_ENDPOINT = _GEMINI_BASE_URL
    EMBED_KEY = _GEMINI_API_KEY
    RAG_EMBEDDING_MODEL = _GEMINI_EMBEDDING_MODEL

# Chat / generation (RAG Q&A + portal chatbot)
if USE_ORG_MODELS:
    CHAT_ENDPOINT: str = API_ENDPOINT
    CHAT_KEY: str = API_KEY
    RAG_CHAT_MODEL: str = os.environ.get("RAG_CHAT_MODEL", "azure_ai/Llama-3.3-70B-Instruct_Mass")
else:
    CHAT_ENDPOINT = _GROQ_BASE_URL
    CHAT_KEY = _GROQ_API_KEY
    RAG_CHAT_MODEL = os.environ.get("GROQ_CHAT_MODEL", "llama-3.3-70b-versatile")

# ── SLA RAG tuning ─────────────────────────────────────────────────────────────
SLA_RAG_CHUNK_SIZE: int = int(os.environ.get("SLA_RAG_CHUNK_SIZE", "800"))
SLA_RAG_CHUNK_OVERLAP: int = int(os.environ.get("SLA_RAG_CHUNK_OVERLAP", "100"))
SLA_RAG_TOP_K: int = int(os.environ.get("SLA_RAG_TOP_K", "4"))

# ── Observability ──────────────────────────────────────────────────────────────
LANGFUSE_PUBLIC_KEY: str = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
LANGFUSE_SECRET_KEY: str = os.environ.get("LANGFUSE_SECRET_KEY", "")
LANGFUSE_HOST: str = os.environ.get("LANGFUSE_HOST", "https://cloud.langfuse.com")

# ── Chatbot memory ─────────────────────────────────────────────────────────────
CHATBOT_HISTORY_RETENTION_DAYS: int = int(os.environ.get("CHATBOT_HISTORY_RETENTION_DAYS", "7"))
CHATBOT_HISTORY_MAX_TURNS: int = int(os.environ.get("CHATBOT_HISTORY_MAX_TURNS", "20"))
