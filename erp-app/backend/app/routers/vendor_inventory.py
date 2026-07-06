from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user, require_role
from app.services import vendor_inventory as svc

router = APIRouter(prefix="/api/vendor_inventory", tags=["vendor_inventory"])

READ_ROLES = ("admin", "warehouse", "inventory_controller")
WRITE_ROLES = ("admin", "vendor", "warehouse", "inventory_controller")


class VendorInventoryItem(BaseModel):
    vendor_username: str | None = None  # admin may set explicitly; vendor defaults to self
    sku: str
    item_name: str
    qty_on_hand: int
    reorder_threshold: int
    manufacturing_critical: bool = False


class VendorInventoryPatch(BaseModel):
    sku: str | None = None
    item_name: str | None = None
    qty_on_hand: int | None = None
    reorder_threshold: int | None = None
    manufacturing_critical: bool | None = None


@router.get("")
def list_items(current_user: dict = Depends(get_current_user)):
    role = current_user["role"]
    if role == "vendor":
        return svc.list_inventory(vendor_username=current_user["username"])
    if role in READ_ROLES:
        return svc.list_inventory()
    raise HTTPException(status_code=403, detail="Not permitted")


@router.get("/{item_id}")
def get_item(item_id: int, current_user: dict = Depends(get_current_user)):
    item = svc.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if current_user["role"] == "vendor" and item.get("vendor_username") != current_user["username"]:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.post("")
def create_item(payload: VendorInventoryItem, current_user: dict = Depends(require_role(*WRITE_ROLES))):
    data = payload.model_dump()
    if current_user["role"] == "vendor":
        data["vendor_username"] = current_user["username"]
    elif not data.get("vendor_username"):
        raise HTTPException(status_code=400, detail="vendor_username required for admin-created items")
    return svc.create_item(data, actor=current_user["username"])


@router.put("/{item_id}")
def update_item(item_id: int, payload: VendorInventoryPatch, current_user: dict = Depends(require_role(*WRITE_ROLES))):
    item = svc.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if current_user["role"] == "vendor" and item.get("vendor_username") != current_user["username"]:
        raise HTTPException(status_code=403, detail="Item does not belong to you")
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    record = svc.update_item(item_id, patch, actor=current_user["username"])
    return record


@router.delete("/{item_id}")
def delete_item(item_id: int, current_user: dict = Depends(require_role(*WRITE_ROLES))):
    item = svc.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if current_user["role"] == "vendor" and item.get("vendor_username") != current_user["username"]:
        raise HTTPException(status_code=403, detail="Item does not belong to you")
    svc.delete_item(item_id, actor=current_user["username"])
    return {"status": "deleted"}
