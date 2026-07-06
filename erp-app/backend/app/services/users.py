from __future__ import annotations

import re

import bcrypt

from app.store import CollectionByKey, now_iso
from app.services.audit_logs import log_action

PASSWORD_MIN_LENGTH = 8
PASSWORD_POLICY_DESCRIPTION = (
    f"Password must be at least {PASSWORD_MIN_LENGTH} characters and include an uppercase "
    "letter, a lowercase letter, a number, and a special character."
)

_col = CollectionByKey("users.json", key_field="username")


def validate_password_policy(password: str) -> None:
    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"Password must be at least {PASSWORD_MIN_LENGTH} characters long")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"[0-9]", password):
        raise ValueError("Password must contain at least one number")
    if not re.search(r"[^A-Za-z0-9]", password):
        raise ValueError("Password must contain at least one special character")


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def _strip_hash(user: dict) -> dict:
    return {k: v for k, v in user.items() if k != "password_hash"}


def list_users(safe: bool = True) -> list[dict]:
    users = sorted(_col.list_all(), key=lambda u: u.get("created_at", ""))
    return [_strip_hash(u) for u in users] if safe else users


def get_user_by_username(username: str, safe: bool = False) -> dict | None:
    user = _col.get_by_key(username)
    if user is None:
        return None
    return _strip_hash(user) if safe else user


def create_user(payload: dict, actor: str = "system") -> dict:
    if "username" in payload:
        payload["username"] = payload["username"].strip().lower()
    plain_password = payload.pop("password", None)
    if plain_password:
        validate_password_policy(plain_password)
        payload["password_hash"] = hash_password(plain_password)
    record = _col.create(payload)
    log_action(actor, "create", "users", None, f"created user {record.get('username')}")
    return _strip_hash(record)


def update_user(username: str, patch: dict, actor: str = "system") -> dict | None:
    plain_password = patch.pop("password", None)
    if plain_password:
        validate_password_policy(plain_password)
        patch["password_hash"] = hash_password(plain_password)
    record = _col.update_by_key(username, patch)
    if record is None:
        return None
    log_action(actor, "update", "users", None, f"updated user {record.get('username')}")
    return _strip_hash(record)


def delete_user(username: str, actor: str = "system") -> bool:
    ok = _col.delete_by_key(username)
    if ok:
        log_action(actor, "delete", "users", None, f"deleted user {username}")
    return ok
