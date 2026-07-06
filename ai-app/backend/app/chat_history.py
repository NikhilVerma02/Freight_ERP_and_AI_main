"""
Chat session history — file-backed, one JSON array per user in data/chat_sessions/.
Kept intentionally thin: no database, no migration, just atomic JSON writes matching
the existing store pattern (agent_logs.json etc.). Sessions are scoped per-user so
different roles don't see each other's conversations.
"""
from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

_DATA_DIR = Path(__file__).parent.parent / "data" / "chat_sessions"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_lock = threading.Lock()


def _user_path(username: str) -> Path:
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in username)
    return _DATA_DIR / f"{safe}.json"


def _load(username: str) -> list[dict]:
    p = _user_path(username)
    if not p.exists():
        return []
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save(username: str, sessions: list[dict]) -> None:
    p = _user_path(username)
    p.write_text(json.dumps(sessions, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------

def list_sessions(username: str) -> list[dict]:
    """Return all sessions for a user, most-recent first. Each session has
    {session_id, title, created_at, updated_at, messages: [...]}."""
    with _lock:
        sessions = _load(username)
    return sorted(sessions, key=lambda s: s.get("updated_at", ""), reverse=True)


def get_session(username: str, session_id: str) -> dict | None:
    with _lock:
        for s in _load(username):
            if s["session_id"] == session_id:
                return s
    return None


def create_session(username: str) -> dict:
    session = {
        "session_id": str(uuid.uuid4()),
        "title": "New conversation",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "messages": [],
    }
    with _lock:
        sessions = _load(username)
        sessions.append(session)
        _save(username, sessions)
    return session


def append_message(username: str, session_id: str, role: str, content: str) -> dict | None:
    """Append a message to the session and auto-update the title from the first user message."""
    msg = {
        "role": role,
        "content": content,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    with _lock:
        sessions = _load(username)
        for s in sessions:
            if s["session_id"] == session_id:
                s["messages"].append(msg)
                s["updated_at"] = msg["timestamp"]
                # Auto-title from first user message (truncate to 60 chars)
                if role == "user" and s["title"] == "New conversation":
                    s["title"] = content[:60] + ("…" if len(content) > 60 else "")
                _save(username, sessions)
                return s
    return None


def delete_session(username: str, session_id: str) -> bool:
    with _lock:
        sessions = _load(username)
        before = len(sessions)
        sessions = [s for s in sessions if s["session_id"] != session_id]
        if len(sessions) == before:
            return False
        _save(username, sessions)
    return True


def clear_all_sessions(username: str) -> None:
    with _lock:
        _save(username, [])
