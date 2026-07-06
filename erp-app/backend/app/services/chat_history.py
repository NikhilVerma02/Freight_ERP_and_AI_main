"""
Per-user chatbot conversation memory, organized into separate SESSIONS (like
a "New chat" / "Recents" list) rather than one continuous thread — see
app/chatbot.py. Stored in data/chatbot_history.json as a flat list of
session records, each holding its own messages:

    {id, username, title, created_at, updated_at, messages: [{role, content, created_at}]}

Retention: a session (and all its messages) drops out of every read once its
`updated_at` is older than CHATBOT_HISTORY_RETENTION_DAYS — no separate
cleanup job needed, expiry is just a timestamp comparison applied
consistently wherever sessions are read.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from app.config import CHATBOT_HISTORY_MAX_TURNS, CHATBOT_HISTORY_RETENTION_DAYS
from app.store import DATA_DIR, now_iso, read_json, write_json

_PATH = DATA_DIR / "chatbot_history.json"
TITLE_MAX_LEN = 48


def _load() -> list[dict]:
    return read_json(_PATH) or []


def _save(sessions: list[dict]) -> None:
    write_json(_PATH, sessions)


def _cutoff_iso() -> str:
    return (datetime.now(timezone.utc) - timedelta(days=CHATBOT_HISTORY_RETENTION_DAYS)).isoformat()


def _derive_title(first_message: str) -> str:
    flat = " ".join(first_message.split())
    return flat if len(flat) <= TITLE_MAX_LEN else flat[: TITLE_MAX_LEN - 1].rstrip() + "…"


def create_session(username: str) -> dict:
    sessions = _load()
    ts = now_iso()
    session = {
        "id": uuid.uuid4().hex[:12],
        "username": username,
        "title": "New chat",
        "created_at": ts,
        "updated_at": ts,
        "messages": [],
    }
    sessions.append(session)
    _save(sessions)
    return session


def list_sessions(username: str) -> list[dict]:
    """Summaries only (no message bodies), newest first, within the retention window."""
    cutoff = _cutoff_iso()
    mine = [s for s in _load() if s.get("username") == username and s.get("updated_at", "") >= cutoff]
    mine.sort(key=lambda s: s.get("updated_at", ""), reverse=True)
    return [
        {
            "id": s["id"],
            "title": s.get("title", "New chat"),
            "created_at": s.get("created_at"),
            "updated_at": s.get("updated_at"),
            "message_count": len(s.get("messages", [])),
        }
        for s in mine
    ]


def get_session(username: str, session_id: str) -> dict | None:
    cutoff = _cutoff_iso()
    for s in _load():
        if s.get("username") == username and s.get("id") == session_id and s.get("updated_at", "") >= cutoff:
            return s
    return None


def get_recent_messages(username: str, session_id: str, max_turns: int = CHATBOT_HISTORY_MAX_TURNS) -> list[dict]:
    """Up to `max_turns` most recent {role, content} messages from this one session,
    oldest first — ready to splice into an LLM messages array as conversational memory.
    Scoped to a single session: switching chats starts a genuinely fresh context."""
    session = get_session(username, session_id)
    if not session:
        return []
    messages = session.get("messages", [])
    recent = messages[-max_turns:] if max_turns else messages
    return [{"role": m["role"], "content": m["content"]} for m in recent]


def append_message(username: str, session_id: str, role: str, content: str) -> None:
    sessions = _load()
    for s in sessions:
        if s.get("username") == username and s.get("id") == session_id:
            s.setdefault("messages", []).append({"role": role, "content": content, "created_at": now_iso()})
            s["updated_at"] = now_iso()
            if role == "user" and s.get("title", "New chat") == "New chat":
                s["title"] = _derive_title(content)
            break
    else:
        return  # session not found (expired or deleted) — silently drop, caller already has its own copy
    _save(sessions)


def delete_session(username: str, session_id: str) -> bool:
    sessions = _load()
    remaining = [s for s in sessions if not (s.get("username") == username and s.get("id") == session_id)]
    if len(remaining) == len(sessions):
        return False
    _save(remaining)
    return True


def purge_expired() -> int:
    """Drop every session (and its messages) older than the retention window, across
    all users. Safe to call opportunistically (e.g. app startup) — pure disk hygiene,
    since reads already filter by the same cutoff."""
    cutoff = _cutoff_iso()
    sessions = _load()
    kept = [s for s in sessions if s.get("updated_at", "") >= cutoff]
    removed = len(sessions) - len(kept)
    if removed:
        _save(kept)
    return removed
