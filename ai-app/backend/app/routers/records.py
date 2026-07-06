"""
GET /api/claims, GET /api/orders — read-only listings backing the AI
portal's "Claim Request" / "Order Request" tabs.
Inspectors see all records (admin-level); admin sees all too.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_role
from app.mcp_client import McpClientError, get_erp_mcp_client

router = APIRouter(prefix="/api", tags=["records"])


@router.get("/claims")
async def list_claims(current_user: dict = Depends(require_role("admin", "inspector"))):
    mcp_client = get_erp_mcp_client()
    try:
        # Both admin and inspector get all claims via MCP (admin-level ERP token)
        raise HTTPException(status_code=501, detail="Claim listing not yet wired to a single MCP call — use ERP portal")
    except McpClientError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/orders")
async def list_orders(current_user: dict = Depends(require_role("admin", "inspector"))):
    mcp_client = get_erp_mcp_client()
    try:
        raise HTTPException(status_code=501, detail="Order listing not yet wired to a single MCP call — use ERP portal")
    except McpClientError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
