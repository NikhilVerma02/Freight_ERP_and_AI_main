from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user, require_role
from app.services import orders as svc

router = APIRouter(prefix="/api/orders", tags=["orders"])


class OrderItem(BaseModel):
    sku: str
    item_name: str
    qty: int


class OrderCreate(BaseModel):
    vendor_username: str | None = None
    items: Any = None          # str (customer freeform) or list[OrderItem] (ERP structured)
    quantity: int | None = None
    notes: str | None = None
    total_amount: float | None = None
    required_by: str | None = None


class AssignVendorRequest(BaseModel):
    vendor_username: str


class OrderStatusUpdate(BaseModel):
    status: str  # delivered | undelivered
    undelivered_reason: str | None = None


@router.get("")
def list_orders(current_user: dict = Depends(get_current_user)):
    return svc.list_orders_for(current_user)


@router.get("/{order_id}")
def get_order(order_id: int, current_user: dict = Depends(get_current_user)):
    order = svc.get_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    role = current_user["role"]
    username = current_user["username"]
    if role == "admin":
        return order
    if role == "customer" and order.get("customer_username") != username:
        raise HTTPException(status_code=404, detail="Order not found")
    if role in ("vendor_order_manager", "vendor_claim_handler") and order.get("vendor_username") != username:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.post("")
def create_order(payload: OrderCreate, current_user: dict = Depends(require_role("customer", "admin"))):
    try:
        items = payload.items
        if isinstance(items, list) and items and hasattr(items[0], "model_dump"):
            items = [i.model_dump() for i in items]
        return svc.create_order(
            customer_username=current_user["username"],
            vendor_username=payload.vendor_username,
            items=items,
            quantity=payload.quantity,
            notes=payload.notes,
            total_amount=payload.total_amount,
            required_by=payload.required_by,
            actor=current_user["username"],
            bypass_link_check=current_user["role"] == "admin",
        )
    except ValueError as e:
        if str(e) == "not_linked":
            raise HTTPException(status_code=403, detail="Not linked to this vendor")
        raise


@router.put("/{order_id}/assign-vendor")
def assign_vendor(order_id: int, payload: AssignVendorRequest, current_user: dict = Depends(require_role("admin", "procurement_officer", "inventory_controller", "finance_officer"))):
    record = svc.assign_vendor(order_id, payload.vendor_username, actor=current_user["username"])
    if not record:
        raise HTTPException(status_code=404, detail="Order not found")
    return record


@router.put("/{order_id}/status")
def update_status(order_id: int, payload: OrderStatusUpdate, current_user: dict = Depends(require_role("vendor_order_manager", "admin"))):
    if payload.status not in ("delivered", "undelivered"):
        raise HTTPException(status_code=400, detail="status must be 'delivered' or 'undelivered'")
    vendor_username = current_user["username"]
    if current_user["role"] == "admin":
        order = svc.get_order(order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        vendor_username = order["vendor_username"]
    try:
        record = svc.update_status(
            order_id,
            vendor_username=vendor_username,
            status=payload.status,
            undelivered_reason=payload.undelivered_reason,
            actor=current_user["username"],
        )
    except ValueError as e:
        if str(e) == "forbidden":
            raise HTTPException(status_code=403, detail="Order does not belong to you")
        raise
    if not record:
        raise HTTPException(status_code=404, detail="Order not found")
    return record


@router.delete("/{order_id}")
def delete_order(order_id: int, current_user: dict = Depends(require_role("admin"))):
    ok = svc.delete_order(order_id, actor=current_user["username"])
    if not ok:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"status": "deleted"}
