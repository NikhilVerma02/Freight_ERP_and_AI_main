"""
POST /api/ingest/run  — run the multi-agent damage-claims pipeline (SSE stream).
GET  /api/ingest/runs — list past runs.
GET  /api/ingest/orders — delivered-order picker for the intake form.

Roles: admin (full access) | inspector (same access as admin here — inspectors
review damage evidence from any order and run the pipeline).
"""
from __future__ import annotations

import json

import os

import httpx
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from app.agents.orchestrator import run_pipeline_stream
from app.auth import require_role
from app.logging_store import get_run, list_logs, list_runs
from app.mcp_client import McpClientError, get_erp_mcp_client

ERP_BASE_URL = os.environ.get("ERP_BASE_URL", "http://127.0.0.1:8001")

router = APIRouter(prefix="/api/ingest", tags=["ingest"])

_MIME_BY_EXTENSION = {
    ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".avi": "video/x-msvideo",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".oga": "audio/ogg",
    ".aac": "audio/aac", ".flac": "audio/flac",
}


def _guess_mime_type(upload: UploadFile, fallback: str) -> str:
    if upload.content_type and upload.content_type != "application/octet-stream":
        return upload.content_type
    name = (upload.filename or "").lower()
    for ext, mime in _MIME_BY_EXTENSION.items():
        if name.endswith(ext):
            return mime
    return fallback


@router.post("/run")
async def ingest_run(
    order_id: int = Form(...),
    sku: str = Form(...),
    media: UploadFile | None = File(default=None),
    manual_transcript: str | None = Form(default=None),
    vendor_username: str | None = Form(default=None),
    customer_username: str | None = Form(default=None),
    current_user: dict = Depends(require_role("admin", "inspector")),
):
    if not media and not manual_transcript:
        raise HTTPException(status_code=400, detail="Provide a video/image file and/or a description.")

    try:
        mcp_client = get_erp_mcp_client()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"ERP MCP client unavailable: {exc}")

    try:
        order = await mcp_client.get_order_by_id(order_id)
        if not order:
            # Try purchase order lookup as fallback
            po = await mcp_client.get_purchase_order_by_id(order_id)
            if po:
                order = {
                    "id": po["id"],
                    "order_number": po.get("po_number", f"PO-{po['id']}"),
                    "vendor_username": po.get("vendor_username", ""),
                    "customer_username": po.get("customer_username", ""),
                    "items": [{"sku": po.get("sku", ""), "item_name": po.get("item_name", ""), "qty": po.get("quantity", 0)}],
                    "status": "delivered",
                }
    except McpClientError as exc:
        raise HTTPException(status_code=503, detail=f"Order lookup failed: {exc}")
    if not order:
        raise HTTPException(status_code=404, detail=f"Order {order_id} not found")

    # If the stored order is missing vendor/customer (e.g. admin-created order without a vendor
    # assigned, or a PO with no customer link), patch in whatever the user explicitly selected
    # on the intake form — they know which vendor this shipment came from.
    if order and vendor_username and not order.get("vendor_username"):
        order = {**order, "vendor_username": vendor_username}
    if order and customer_username and not order.get("customer_username"):
        order = {**order, "customer_username": customer_username}

    files: list[dict] = []
    if media is not None:
        data = await media.read()
        if data:
            files.append({"data": data, "mime_type": _guess_mime_type(media, "image/jpeg")})

    async def event_stream():
        async for event in run_pipeline_stream(
            mcp_client, order_id, sku, files, manual_transcript,
            actor_username=current_user["username"], actor_role=current_user["role"],
            hint_vendor_username=vendor_username or "",
            hint_customer_username=customer_username or "",
        ):
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/vendors")
async def list_vendor_options(
    current_user: dict = Depends(require_role("admin", "inspector")),
    authorization: str | None = Header(default=None),
):
    """Return all vendor users from the ERP for the intake form dropdowns."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{ERP_BASE_URL}/api/users",
                headers={"Authorization": authorization or ""},
            )
        users = resp.json() if resp.status_code == 200 else []
    except httpx.HTTPError:
        users = []
    return [
        {
            "username": u["username"],
            "display_name": u.get("display_name", u["username"]),
            "company_name": u.get("company_name") or None,
        }
        for u in users
        if u.get("role") in ("vendor", "vendor_order_manager")
    ]


@router.get("/customers")
async def list_customer_options(
    current_user: dict = Depends(require_role("admin", "inspector")),
    authorization: str | None = Header(default=None),
):
    """Return all customer users from the ERP for the intake form dropdowns."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{ERP_BASE_URL}/api/users",
                headers={"Authorization": authorization or ""},
            )
        users = resp.json() if resp.status_code == 200 else []
    except httpx.HTTPError:
        users = []
    return [
        {
            "username": u["username"],
            "display_name": u.get("display_name", u["username"]),
            "company_name": u.get("company_name") or None,
        }
        for u in users
        if u.get("role") == "customer"
    ]


@router.get("/orders")
async def list_order_options(
    vendor_username: str | None = Query(default=None),
    customer_username: str | None = Query(default=None),
    current_user: dict = Depends(require_role("admin", "inspector")),
    authorization: str | None = Header(default=None),
):
    """Return delivered orders eligible for a damage claim.
    Optionally filter by vendor_username and/or customer_username.
    With no filter, returns all delivered orders from the ERP."""
    mcp_client = get_erp_mcp_client()
    try:
        if customer_username:
            orders = await mcp_client.list_customer_orders(customer_username, vendor_username)
            return [o for o in orders if o.get("status") == "delivered"]
        elif vendor_username:
            # Fetch purchase orders for this vendor (the primary delivered-order type in this demo)
            pos = await mcp_client.list_vendor_purchase_orders(vendor_username)
            delivered_pos = [po for po in pos if po.get("status") == "Delivered"]
            # Normalise PO shape to match what the frontend expects for order options
            return [
                {
                    "id": po["id"],
                    "order_number": po.get("po_number", f"PO-{po['id']}"),
                    "vendor_username": po.get("vendor_username", ""),
                    "customer_username": po.get("customer_username", ""),
                    "items": [{"sku": po.get("sku", ""), "item_name": po.get("item_name", ""), "qty": po.get("quantity", 0)}],
                    "status": "delivered",
                    "_is_po": True,
                }
                for po in delivered_pos
            ]
        else:
            # No filter — fetch all orders directly from the ERP REST API
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    resp = await client.get(
                        f"{ERP_BASE_URL}/api/orders",
                        headers={"Authorization": authorization or ""},
                    )
                orders = resp.json() if resp.status_code == 200 else []
            except httpx.HTTPError:
                orders = []
            return [o for o in orders if o.get("status") == "delivered"]
    except McpClientError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/runs")
async def get_runs(current_user: dict = Depends(require_role("admin", "inspector"))):
    if current_user["role"] == "admin":
        return list_runs()
    return list_runs(actor_username=current_user["username"])


@router.get("/runs/{run_id}")
async def get_run_detail(run_id: str, current_user: dict = Depends(require_role("admin", "inspector"))):
    run = get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if current_user["role"] != "admin" and run.get("actor_username") != current_user["username"]:
        raise HTTPException(status_code=403, detail="Not permitted")
    logs = list_logs(run_id=run_id)
    return {"run": run, "steps": logs}
