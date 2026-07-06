from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user, require_role
from app.services import links as svc
from app.services import users as users_svc

router = APIRouter(prefix="/api/links", tags=["links"])

ADMIN_ONLY = ("admin", "warehouse")


class LinkSet(BaseModel):
    customer_username: str
    vendor_usernames: list[str]


class ConnectCustomer(BaseModel):
    customer_username: str


@router.get("")
def list_links(current_user: dict = Depends(get_current_user)):
    if current_user["role"] in ADMIN_ONLY:
        return svc.list_links()
    if current_user["role"] == "customer":
        return [l for l in svc.list_links() if l.get("customer_username") == current_user["username"]]
    if current_user["role"] == "vendor":
        return [l for l in svc.list_links() if l.get("vendor_username") == current_user["username"]]
    return []


@router.put("")
def set_links(payload: LinkSet, current_user: dict = Depends(require_role(*ADMIN_ONLY))):
    return svc.set_links_for_customer(payload.customer_username, payload.vendor_usernames, actor=current_user["username"])


@router.post("/connect-customer")
def connect_customer(payload: ConnectCustomer, current_user: dict = Depends(require_role("vendor"))):
    """A vendor self-service links an existing customer to themselves (no admin involvement)."""
    customer = users_svc.get_user_by_username(payload.customer_username, safe=True)
    if not customer or customer.get("role") != "customer":
        raise HTTPException(status_code=404, detail="No such customer")
    return svc.create_link(payload.customer_username, current_user["username"], actor=current_user["username"])


@router.delete("/{link_id}")
def delete_link(link_id: int, current_user: dict = Depends(require_role(*ADMIN_ONLY))):
    ok = svc.delete_link(link_id, actor=current_user["username"])
    if not ok:
        raise HTTPException(status_code=404, detail="Link not found")
    return {"status": "deleted"}
