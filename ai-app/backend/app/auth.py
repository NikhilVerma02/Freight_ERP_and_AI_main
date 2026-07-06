"""
RBAC for the AI app — same three roles as the ERP (admin/vendor/customer).
This app has no session store of its own (see app/routers/auth.py for why
login is proxied to the ERP); request-time auth here re-validates the
bearer token against the ERP's /api/auth/me on every call. That's an extra
network hop per request, but it means session expiry/logout in the ERP is
honored immediately here too — no second source of truth to drift out of
sync.
"""
from __future__ import annotations

import os

import httpx
from fastapi import Depends, Header, HTTPException

ERP_BASE_URL = os.environ.get("ERP_BASE_URL", "http://127.0.0.1:8001")


async def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{ERP_BASE_URL}/api/auth/me", headers={"Authorization": authorization})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail=f"Could not reach ERP auth service: {exc}")

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return resp.json()


def require_role(*roles: str):
    async def _dependency(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user["role"] not in roles:
            raise HTTPException(status_code=403, detail=f"Role '{current_user['role']}' not permitted for this action")
        return current_user

    return _dependency
