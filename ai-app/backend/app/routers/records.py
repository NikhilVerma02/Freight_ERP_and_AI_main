"""
GET /api/claims, GET /api/orders — read-only listings backing the AI
portal's "Claim Request" / "Order Request" tabs.
Inspectors see all records (admin-level); admin sees all too.
"""
from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException

from app.auth import require_role

router = APIRouter(prefix="/api", tags=["records"])

ERP_BASE_URL = os.environ.get("ERP_BASE_URL", "http://127.0.0.1:8001")


@router.get("/claims")
async def list_claims(
    current_user: dict = Depends(require_role("admin", "inspector")),
    authorization: str | None = Header(default=None),
):
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{ERP_BASE_URL}/api/claims",
                headers={"Authorization": authorization or ""},
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail=f"ERP unreachable: {exc}")


@router.get("/orders")
async def list_orders(
    current_user: dict = Depends(require_role("admin", "inspector")),
    authorization: str | None = Header(default=None),
):
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{ERP_BASE_URL}/api/orders",
                headers={"Authorization": authorization or ""},
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail=f"ERP unreachable: {exc}")
