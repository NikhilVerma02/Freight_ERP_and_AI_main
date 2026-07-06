"""
Freight AI chatbot — answers questions about cases, freight policy, logistics,
and the current ERP system state. Uses the organisation's LLM gateway (role
"chat", see app/config/models.py) for generation with full per-session
message history so each session has real conversational memory.
"""
from __future__ import annotations

import logging

from app import chat_history
from app.llm_client import llm_client

logger = logging.getLogger("ai_app.chatbot")

_SYSTEM_PROMPT = (
    "You are FreightBot, an expert AI assistant for a freight damage management platform. "
    "You help operations staff, vendors, and customers with: understanding freight claims, "
    "SLA policies, damage assessment workflows, inventory management, ERP processes, "
    "and general logistics questions. "
    "Be concise, professional, and practical. When you don't know specific data (like exact "
    "claim statuses), acknowledge it and suggest where the user can find that information "
    "in the portal. Format responses with markdown when helpful — use bullet points, "
    "bold text, and code blocks for structured information. Never fabricate specific claim "
    "IDs, order numbers, or monetary amounts."
)


def ask(username: str, session_id: str, question: str) -> dict:
    """Send a question in the context of a session and return {answer, session}."""
    session = chat_history.get_session(username, session_id)
    if session is None:
        return {"error": "Session not found", "answer": None, "session": None}

    # Build conversation history for Groq (last 20 messages to keep tokens sane)
    history = session["messages"][-20:]
    messages = [{"role": "system", "content": _SYSTEM_PROMPT}]
    for m in history:
        if m["role"] in ("user", "assistant"):
            messages.append({"role": m["role"], "content": m["content"]})
    messages.append({"role": "user", "content": question})

    result = llm_client.chat("chat", messages, temperature=0.4, max_tokens=1024)
    if result["status"] != "ok":
        err = result.get("error") or "unknown error"
        logger.error("chatbot ask failed: %s", err)
        if "429" in err or "rate_limit" in err.lower():
            answer = (
                "The AI provider has hit its rate limit right now. "
                "Please wait a few minutes and try again — no action needed on your end."
            )
        elif "not configured" in err:
            answer = "FreightBot is unavailable right now — the AI provider is not configured."
        else:
            answer = f"FreightBot encountered an error: {err}"
    else:
        answer = (result["content"] or "No response.").strip()

    # Persist both turns
    chat_history.append_message(username, session_id, "user", question)
    chat_history.append_message(username, session_id, "assistant", answer)

    updated = chat_history.get_session(username, session_id)
    return {"answer": answer, "session": updated, "error": None}
