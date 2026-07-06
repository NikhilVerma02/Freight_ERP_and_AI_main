from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.services import customer_inventory as svc

router = APIRouter(prefix="/api/customer_inventory", tags=["customer_inventory"])


@router.get("")
def list_items(current_user: dict = Depends(get_current_user)):
    role = current_user["role"]
    if role == "customer":
        return svc.list_inventory(customer_username=current_user["username"])
    if role in ("admin", "warehouse"):
        return svc.list_inventory()
    raise HTTPException(status_code=403, detail="Not permitted")


@router.get("/{item_id}")
def get_item(item_id: int, current_user: dict = Depends(get_current_user)):
    item = svc.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if current_user["role"] == "customer" and item.get("customer_username") != current_user["username"]:
        raise HTTPException(status_code=404, detail="Item not found")
    if current_user["role"] not in ("customer", "admin", "warehouse"):
        raise HTTPException(status_code=403, detail="Not permitted")
    return item
