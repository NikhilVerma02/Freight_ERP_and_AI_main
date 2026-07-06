"""Sales Orders — vendor dispatches a Purchase Order and generates a SO number."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user, require_role
from app.services import purchase_orders as po_svc
from app.store import Collection, now_iso

router = APIRouter(prefix="/api/sales-orders", tags=["sales_orders"])

_col = Collection("sales_orders.json")


def _next_so_number() -> str:
    orders = _col.list_all()
    max_n = 0
    for row in orders:
        sn = row.get("so_number") or ""
        if sn.startswith("SO-"):
            try:
                max_n = max(max_n, int(sn.split("-")[1]))
            except (IndexError, ValueError):
                pass
    return f"SO-{max_n + 1:04d}"


@router.get("")
def list_sales_orders(current_user: dict = Depends(get_current_user)):
    role = current_user["role"]
    username = current_user["username"]
    all_so = sorted(_col.list_all(), key=lambda r: r.get("created_at", ""), reverse=True)
    if role in ("vendor_order_manager", "vendor_claim_handler"):
        return [s for s in all_so if s.get("vendor_username") == username]
    if role in ("admin", "procurement_officer", "inventory_controller", "finance_officer"):
        return all_so
    raise HTTPException(403, "Access denied")


class SalesOrderCreate(BaseModel):
    po_id: str
    notes: Optional[str] = None


@router.post("")
def create_sales_order(
    body: SalesOrderCreate,
    current_user: dict = Depends(require_role("vendor_order_manager")),
):
    """Vendor dispatches a PO — generates SO number and marks PO as Dispatched."""
    po = po_svc.get_purchase_order(body.po_id)
    if not po:
        raise HTTPException(404, "Purchase order not found")
    if po["vendor_username"] != current_user["username"]:
        raise HTTPException(403, "This PO does not belong to you")

    ts = now_iso()
    so_number = _next_so_number()

    so = _col.create({
        "so_number": so_number,
        "po_id": body.po_id,
        "po_number": po.get("po_number"),
        "vendor_username": current_user["username"],
        "dispatched_at": ts,
        "status": "Dispatched",
        "notes": body.notes,
    })

    po_svc.update_purchase_order(body.po_id, {"status": "Dispatched", "so_number": so_number})
    return so


class SOStatusUpdate(BaseModel):
    status: str
    delivered_at: Optional[str] = None


@router.put("/{so_id}")
def update_sales_order(
    so_id: str,
    body: SOStatusUpdate,
    current_user: dict = Depends(require_role("vendor_order_manager")),
):
    try:
        so_id_int = int(so_id)
    except ValueError:
        raise HTTPException(404, "Sales order not found")

    so = _col.get(so_id_int)
    if not so:
        raise HTTPException(404, "Sales order not found")
    if so["vendor_username"] != current_user["username"]:
        raise HTTPException(403, "This SO does not belong to you")

    patch: dict = {"status": body.status}
    if body.delivered_at:
        patch["delivered_at"] = body.delivered_at

    if body.status == "Delivered":
        po_svc.update_purchase_order(so["po_id"], {"status": "Delivered"})

    updated = _col.update(so_id_int, patch)
    return updated
