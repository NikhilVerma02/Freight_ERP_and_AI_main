"""
AI-app inspector management — admin only.
Reads/writes directly to the shared erp-app/backend/data/users.json so there
is one source of truth for all accounts without an HTTP proxy dependency on
the ERP backend being up.
"""
from __future__ import annotations

import json
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import require_role

router = APIRouter(prefix="/api/users", tags=["users"])

# Shared JSON store — same file the ERP backend uses
_USERS_FILE = Path(__file__).parent.parent.parent.parent.parent / "erp-app" / "backend" / "data" / "users.json"
_lock = threading.Lock()


def _read() -> list[dict]:
    if not _USERS_FILE.exists():
        return []
    with open(_USERS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _write(users: list[dict]) -> None:
    fd, tmp = tempfile.mkstemp(dir=str(_USERS_FILE.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(users, f, indent=2, ensure_ascii=False, default=str)
        os.replace(tmp, str(_USERS_FILE))
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class InspectorCreate(BaseModel):
    username: str
    password: str
    display_name: str
    email: str | None = None


class InspectorPatch(BaseModel):
    password: str | None = None
    display_name: str | None = None
    email: str | None = None


@router.get("")
async def list_inspectors(current_user: dict = Depends(require_role("admin"))):
    with _lock:
        users = _read()
    return [
        {"username": u["username"], "display_name": u.get("display_name", ""), "email": u.get("email"), "role": u["role"]}
        for u in users if u.get("role") == "inspector"
    ]


@router.post("")
async def create_inspector(body: InspectorCreate, current_user: dict = Depends(require_role("admin"))):
    username = body.username.strip().lower()
    with _lock:
        users = _read()
        if any(u["username"] == username for u in users):
            raise HTTPException(409, "Username already exists")
        pw_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt(12)).decode()
        now = _now()
        new_user: dict[str, Any] = {
            "username": username,
            "password_hash": pw_hash,
            "role": "inspector",
            "display_name": body.display_name,
            "company_name": None,
            "email": body.email,
            "created_at": now,
            "updated_at": now,
        }
        users.append(new_user)
        _write(users)
    return {"username": new_user["username"], "display_name": new_user["display_name"], "email": new_user["email"], "role": "inspector"}


@router.put("/{username}")
async def update_inspector(username: str, body: InspectorPatch, current_user: dict = Depends(require_role("admin"))):
    with _lock:
        users = _read()
        idx = next((i for i, u in enumerate(users) if u["username"] == username and u.get("role") == "inspector"), None)
        if idx is None:
            raise HTTPException(404, "Inspector not found")
        if body.display_name is not None:
            users[idx]["display_name"] = body.display_name
        if body.email is not None:
            users[idx]["email"] = body.email
        if body.password:
            users[idx]["password_hash"] = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt(12)).decode()
        users[idx]["updated_at"] = _now()
        _write(users)
        u = users[idx]
    return {"username": u["username"], "display_name": u.get("display_name", ""), "email": u.get("email"), "role": u["role"]}


@router.delete("/{username}")
async def delete_inspector(username: str, current_user: dict = Depends(require_role("admin"))):
    with _lock:
        users = _read()
        idx = next((i for i, u in enumerate(users) if u["username"] == username and u.get("role") == "inspector"), None)
        if idx is None:
            raise HTTPException(404, "Inspector not found")
        users.pop(idx)
        _write(users)
    return {"status": "deleted"}
