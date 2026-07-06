"""
Chat/generation provider. Endpoint and model are resolved by app.config based
on USE_ORG_MODELS:
  true  → organisational LiteLLM gateway  (CHAT_ENDPOINT / CHAT_KEY)
  false → Groq free-tier OpenAI-compat    (api.groq.com)
"""
from __future__ import annotations

import logging

from app import observability
from app.config import CHAT_ENDPOINT, CHAT_KEY, RAG_CHAT_MODEL

logger = logging.getLogger("erp_app.rag.llm")

_client = None


def _get_client():
    global _client
    if not CHAT_ENDPOINT or not CHAT_KEY:
        return None
    if _client is None:
        from openai import OpenAI
        _client = OpenAI(base_url=CHAT_ENDPOINT, api_key=CHAT_KEY)
    return _client


def chat(
    system_prompt: str,
    user_prompt: str,
    name: str = "chat",
    temperature: float = 0.3,
    trace_id: str | None = None,
    history: list[dict] | None = None,
) -> str | None:
    """Generic chat-completion call instrumented for every caller (SLA Q&A, ERP chatbot, etc).
    Returns None on failure."""
    client = _get_client()
    if client is None:
        logger.warning("llm: CHAT_ENDPOINT/CHAT_KEY not set — cannot answer")
        return None

    messages = [{"role": "system", "content": system_prompt}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user_prompt})

    generation = observability.start_generation(
        trace_id, name, RAG_CHAT_MODEL,
        input={"system": system_prompt, "user": user_prompt, "history_turns": len(history or [])}
    )
    try:
        resp = client.chat.completions.create(
            model=RAG_CHAT_MODEL,
            messages=messages,
            temperature=temperature,
        )
        content = resp.choices[0].message.content
        usage = getattr(resp, "usage", None)
        observability.finish_generation(
            generation,
            output=content,
            status="ok",
            usage={"input": getattr(usage, "prompt_tokens", None),
                   "output": getattr(usage, "completion_tokens", None)} if usage else None,
        )
        return content
    except Exception as exc:
        logger.error("llm: chat completion failed: %s", exc)
        observability.finish_generation(generation, status="error", error=str(exc))
        return None


def answer_question(question: str, context_chunks: list[str], trace_id: str | None = None) -> str | None:
    """Answer `question` grounded only in `context_chunks`. Returns None on failure."""
    context = "\n\n---\n\n".join(context_chunks) if context_chunks else "(no relevant SLA text found)"
    system_prompt = (
        "You are an assistant answering questions about a vendor's Service Level "
        "Agreement (SLA) document. Answer ONLY using the SLA excerpts provided below. "
        "If the answer isn't contained in the excerpts, say you don't have enough "
        "information in the SLA to answer. Be concise."
    )
    user_prompt = f"SLA excerpts:\n{context}\n\nQuestion: {question}"
    return chat(system_prompt, user_prompt, name="sla_answer", temperature=0.2, trace_id=trace_id)
