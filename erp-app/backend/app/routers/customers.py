from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.services import claims as claims_svc
from app.services import links as links_svc
from app.services import orders as orders_svc
from app.services import users as users_svc

router = APIRouter(prefix="/api/customers", tags=["customers"])


@router.get("/{customer_username}/vendors")
def my_vendors(customer_username: str, current_user: dict = Depends(get_current_user)):
    """Mirror of GET /api/vendors/{vendor_username}/customers, reversed: a customer's
    own "My Vendors" view — who they deal with, and how much order/claim activity."""
    if current_user["role"] == "customer" and current_user["username"] != customer_username:
        raise HTTPException(status_code=403, detail="Not permitted")
    if current_user["role"] not in ("customer", "admin", "warehouse"):
        raise HTTPException(status_code=403, detail="Not permitted")

    vendor_usernames = links_svc.vendors_for_customer(customer_username)
    all_orders = orders_svc.list_orders()
    all_claims = claims_svc.list_claims()

    results = []
    for username in vendor_usernames:
        user = users_svc.get_user_by_username(username, safe=True)
        order_count = sum(1 for o in all_orders if o.get("vendor_username") == username and o.get("customer_username") == customer_username)
        claim_count = sum(1 for c in all_claims if c.get("vendor_username") == username and c.get("customer_username") == customer_username)
        results.append(
            {
                "username": username,
                "display_name": (user or {}).get("display_name", username),
                "company_name": (user or {}).get("company_name"),
                "order_count": order_count,
                "claim_count": claim_count,
            }
        )
    return results


@router.delete("/{customer_username}/vendors/{vendor_username}")
def remove_vendor(customer_username: str, vendor_username: str, current_user: dict = Depends(get_current_user)):
    """A customer self-service unlinks a vendor (the reverse of POST /api/links/connect-customer)."""
    if current_user["role"] == "customer" and current_user["username"] != customer_username:
        raise HTTPException(status_code=403, detail="Not permitted")
    if current_user["role"] not in ("customer", "admin", "warehouse"):
        raise HTTPException(status_code=403, detail="Not permitted")

    link = links_svc.get_link_by_pair(customer_username, vendor_username)
    if not link:
        raise HTTPException(status_code=404, detail="Not linked to this vendor")
    links_svc.delete_link(link["id"], actor=current_user["username"])
    return {"status": "deleted"}
