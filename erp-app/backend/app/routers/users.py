from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user, require_role
from app.services import links as links_svc
from app.services import users as svc

router = APIRouter(prefix="/api/users", tags=["users"])

ADMIN_ONLY = ("admin",)
ALL_ROLES = {"admin", "procurement_officer", "inventory_controller", "finance_officer", "vendor_order_manager", "vendor_claim_handler", "customer", "inspector"}


class UserCreate(BaseModel):
    username: str
    password: str
    role: str
    display_name: str
    company_name: str | None = None
    email: str | None = None
    vendor_usernames: list[str] | None = None  # for role=customer


class UserPatch(BaseModel):
    password: str | None = None
    role: str | None = None
    display_name: str | None = None
    company_name: str | None = None
    email: str | None = None
    vendor_usernames: list[str] | None = None


@router.get("")
def list_users(current_user: dict = Depends(get_current_user)):
    return svc.list_users()


@router.get("/{username}")
def get_user(username: str, current_user: dict = Depends(get_current_user)):
    user = svc.get_user_by_username(username, safe=True)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("")
def create_user(payload: UserCreate, current_user: dict = Depends(require_role(*ADMIN_ONLY))):
    data = payload.model_dump()
    vendor_usernames = data.pop("vendor_usernames", None)
    if data.get("role") not in ALL_ROLES:
        raise HTTPException(status_code=400, detail=f"role must be one of: {', '.join(sorted(ALL_ROLES))}")
    try:
        record = svc.create_user(data, actor=current_user["username"])
    except ValueError as exc:
        if "duplicate key" in str(exc):
            raise HTTPException(status_code=409, detail="Username already exists")
        raise HTTPException(status_code=400, detail=str(exc))
    if record["role"] == "customer" and vendor_usernames:
        links_svc.set_links_for_customer(record["username"], vendor_usernames, actor=current_user["username"])
    return record


@router.put("/{username}")
def update_user(username: str, payload: UserPatch, current_user: dict = Depends(require_role(*ADMIN_ONLY))):
    data = payload.model_dump()
    vendor_usernames = data.pop("vendor_usernames", None)
    patch = {k: v for k, v in data.items() if v is not None}
    try:
        record = svc.update_user(username, patch, actor=current_user["username"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not record:
        raise HTTPException(status_code=404, detail="User not found")
    if record["role"] == "customer" and vendor_usernames is not None:
        links_svc.set_links_for_customer(username, vendor_usernames, actor=current_user["username"])
    return record


@router.delete("/{username}")
def delete_user(username: str, current_user: dict = Depends(require_role(*ADMIN_ONLY))):
    ok = svc.delete_user(username, actor=current_user["username"])
    if not ok:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "deleted"}
