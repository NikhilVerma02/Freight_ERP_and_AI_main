"""
AI app auth — kept deliberately lightweight. This app's primary identity is
"the agent system", not a second source of RBAC truth, so rather than
duplicating the ERP's bcrypt/session logic here we PROXY login requests to
the ERP's own /api/auth/login REST endpoint and simply pass the resulting
token/role back to the AI frontend. This is less brittle than re-reading
erp-app/backend/data/users.json directly (that would duplicate the bcrypt
verification logic and could drift if the ERP's user schema changes).

Session tokens issued by the ERP are valid against the ERP; the AI frontend
just stores {token, role, display_name} to gate its own pages (chat/KPI/
logs) by role, same as the ERP frontend does.
"""
from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])

ERP_BASE_URL = os.environ.get("ERP_BASE_URL", "http://127.0.0.1:8001")


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(payload: LoginRequest):
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(f"{ERP_BASE_URL}/api/auth/login", json=payload.model_dump())
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail=f"Could not reach ERP auth service: {exc}")

    if resp.status_code != 200:
        try:
            detail = resp.json().get("detail", "Login failed")
        except Exception:
            detail = "Login failed"
        raise HTTPException(status_code=resp.status_code, detail=detail)

    return resp.json()


@router.get("/me")
async def me(authorization: str | None = Header(default=None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{ERP_BASE_URL}/api/auth/me", headers={"Authorization": authorization})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail=f"Could not reach ERP auth service: {exc}")

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail="Invalid or expired session")
    return resp.json()
