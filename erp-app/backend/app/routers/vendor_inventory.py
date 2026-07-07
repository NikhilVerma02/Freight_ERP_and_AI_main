from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user, require_role
from app.services import vendor_inventory as svc

router = APIRouter(prefix="/api/vendor_inventory", tags=["vendor_inventory"])

READ_ROLES  = ("admin", "warehouse")
WRITE_ROLES = ("admin", "vendor", "warehouse")
ERP_ROLES   = ("admin", "warehouse")   # only ERP operators may set daily_production_requirement


class VendorInventoryItem(BaseModel):
    vendor_username: str | None = None  # admin/warehouse set explicitly; vendor defaults to self
    sku: str
    item_name: str
    qty_on_hand: int
    reorder_threshold: int
    manufacturing_critical: bool = False
    daily_production_requirement: int = 0  # set by ERP admin/warehouse only


class VendorInventoryPatch(BaseModel):
    sku: str | None = None
    item_name: str | None = None
    qty_on_hand: int | None = None
    reorder_threshold: int | None = None
    manufacturing_critical: bool | None = None
    daily_production_requirement: int | None = None  # ERP admin/warehouse only


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
    if current_user["role"] not in (*READ_ROLES, "vendor"):
        raise HTTPException(status_code=403, detail="Not permitted")
    return item


@router.post("")
def create_item(payload: VendorInventoryItem, current_user: dict = Depends(require_role(*WRITE_ROLES))):
    data = payload.model_dump()
    if current_user["role"] == "vendor":
        data["vendor_username"] = current_user["username"]
        # vendors cannot set the production requirement — clear it
        data["daily_production_requirement"] = 0
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

    # vendors cannot touch daily_production_requirement — silently strip it
    if current_user["role"] == "vendor":
        patch.pop("daily_production_requirement", None)

    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")

    return svc.update_item(item_id, patch, actor=current_user["username"])


@router.delete("/{item_id}")
def delete_item(item_id: int, current_user: dict = Depends(require_role(*WRITE_ROLES))):
    item = svc.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if current_user["role"] == "vendor" and item.get("vendor_username") != current_user["username"]:
        raise HTTPException(status_code=403, detail="Item does not belong to you")
    svc.delete_item(item_id, actor=current_user["username"])
    return {"status": "deleted"}
