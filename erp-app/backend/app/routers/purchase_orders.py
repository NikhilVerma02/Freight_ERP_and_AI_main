from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user, require_role
from app.services import vendor_inventory as inv_svc
from app.services import purchase_orders as po_svc
from app.store import now_iso

router = APIRouter(prefix="/api/purchase-orders", tags=["purchase_orders"])


def _next_po_number() -> str:
    orders = po_svc.list_purchase_orders()
    max_n = 0
    for row in orders:
        pn = row.get("po_number") or ""
        if pn.startswith("PO-"):
            try:
                max_n = max(max_n, int(pn.split("-")[1]))
            except (IndexError, ValueError):
                pass
    return f"PO-{max_n + 1:04d}"


def _enrich_pos(pos: list[dict]) -> list[dict]:
    """Add created_by_company, created_by_display_name, and vendor_company_name to each PO."""
    from app.services.users import get_user_by_username
    cache: dict[str, dict] = {}

    def _lookup(username: str) -> dict:
        if username not in cache:
            u = get_user_by_username(username, safe=True) or {}
            cache[username] = {
                "company": u.get("company_name") or u.get("display_name") or username,
                "display": u.get("display_name") or username,
            }
        return cache[username]

    result = []
    for po in pos:
        cb  = po.get("created_by") or ""
        ven = po.get("vendor_username") or ""
        result.append({
            **po,
            "created_by_company":      _lookup(cb)["company"],
            "created_by_display_name": _lookup(cb)["display"],
            "vendor_company_name":     _lookup(ven)["company"],
        })
    return result


@router.get("")
def list_purchase_orders(current_user: dict = Depends(get_current_user)):
    role = current_user["role"]
    username = current_user["username"]
    if role in ("vendor_order_manager", "vendor_claim_handler"):
        from app.services.users import get_user_by_username, list_users
        user_rec = get_user_by_username(username, safe=False) or {}
        company = user_rec.get("company_name") or ""
        if company:
            vendor_usernames = {
                u["username"] for u in list_users(safe=False)
                if u.get("company_name") == company
                   and u.get("role") in ("vendor", "vendor_order_manager", "vendor_claim_handler")
            }
        else:
            vendor_usernames = {username}
        pos = [po for po in po_svc.list_purchase_orders() if po.get("vendor_username") in vendor_usernames]
        return _enrich_pos(pos)
    if role in ("admin", "procurement_officer", "inventory_controller", "finance_officer"):
        return _enrich_pos(po_svc.list_purchase_orders())
    raise HTTPException(403, "Access denied")


class PurchaseOrderCreate(BaseModel):
    vendor_username: str
    sku: str
    item_name: str
    quantity: int
    delivery_date: Optional[str] = None


@router.post("")
def create_purchase_order(
    body: PurchaseOrderCreate,
    current_user: dict = Depends(require_role("admin", "procurement_officer")),
):
    ts = now_iso()
    payload: dict = {
        "po_number": _next_po_number(),
        "vendor_username": body.vendor_username,
        "sku": body.sku,
        "item_name": body.item_name,
        "quantity": body.quantity,
        "item_code": body.sku,
        "item_quantity": body.quantity,
        "customer_name": current_user.get("display_name") or current_user["username"],
        "total_cost": 0,
        "status": "Pending",
        "inventory_added": False,
        "created_by": current_user["username"],
        "date_raised": ts,
    }
    if body.delivery_date:
        payload["delivery_date"] = body.delivery_date
    return po_svc.create_purchase_order(payload)


class DeliverRequest(BaseModel):
    cost_per_unit: Optional[float] = None


@router.put("/{po_id}/deliver")
def deliver_purchase_order(
    po_id: str,
    body: DeliverRequest = DeliverRequest(),
    current_user: dict = Depends(get_current_user),
):
    """Mark a PO as Delivered (vendor or admin action)."""
    role = current_user["role"]
    username = current_user["username"]
    allowed_roles = ("vendor", "vendor_order_manager", "vendor_claim_handler", "admin", "warehouse")
    if role not in allowed_roles:
        raise HTTPException(403, "Access denied")
    po = po_svc.get_purchase_order(po_id)
    if not po:
        raise HTTPException(404, "PO not found")
    # Non-admin vendor users may only deliver their own company's POs
    if role in ("vendor", "vendor_order_manager", "vendor_claim_handler"):
        from app.services.users import get_user_by_username, list_users
        user_rec = get_user_by_username(username, safe=False) or {}
        company = user_rec.get("company_name") or ""
        if company:
            vendor_usernames = {
                u["username"] for u in list_users(safe=False)
                if u.get("company_name") == company
                   and u.get("role") in ("vendor", "vendor_order_manager", "vendor_claim_handler")
            }
        else:
            vendor_usernames = {username}
        if po["vendor_username"] not in vendor_usernames:
            raise HTTPException(403, "Forbidden — this PO does not belong to your company")
    if po["status"] == "Delivered":
        raise HTTPException(400, "PO is already delivered")
    patch: dict = {"status": "Delivered"}
    if body.cost_per_unit is not None:
        patch["cost_per_unit"] = body.cost_per_unit
        patch["total_cost"] = round(body.cost_per_unit * po["quantity"], 2)
    updated = po_svc.update_purchase_order(po_id, patch)
    return updated


class AddInventoryRequest(BaseModel):
    quantity: int


@router.put("/{po_id}/add-inventory")
def add_inventory(
    po_id: str,
    body: AddInventoryRequest,
    current_user: dict = Depends(require_role("inventory_controller", "admin")),
):
    """Inventory Controller adds quantity from a delivered PO to vendor inventory."""
    if body.quantity <= 0:
        raise HTTPException(400, "Quantity must be greater than zero")
    po = po_svc.get_purchase_order(po_id)
    if not po:
        raise HTTPException(404, "PO not found")
    if po["status"] != "Delivered":
        raise HTTPException(400, "Can only add inventory for Delivered POs")
    if po.get("inventory_added"):
        raise HTTPException(400, "Inventory has already been added for this PO")

    vendor = po["vendor_username"]
    sku = po["sku"]
    damaged_qty = max(0, po["quantity"] - body.quantity)

    existing = inv_svc.get_by_sku(vendor, sku)
    if existing:
        inv_svc.update_item(
            existing["id"],
            {
                "qty_on_hand": existing["qty_on_hand"] + body.quantity,
                "damaged_qty": existing.get("damaged_qty", 0) + damaged_qty,
            },
            actor=current_user["username"],
        )
    else:
        inv_svc.create_item({
            "vendor_username": vendor,
            "sku": sku,
            "item_name": po["item_name"],
            "qty_on_hand": body.quantity,
            "reorder_threshold": 0,
            "manufacturing_critical": False,
            "damaged_qty": damaged_qty,
        }, actor=current_user["username"])

    po_svc.update_purchase_order(po_id, {
        "inventory_added": True,
        "accepted_qty": body.quantity,
        "damaged_qty": damaged_qty,
    })
    return {"status": "ok", "added": body.quantity, "damaged": damaged_qty, "sku": sku, "vendor": vendor}
