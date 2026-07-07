from __future__ import annotations

from app.store import Collection
from app.services import alerts as alerts_svc
from app.services import customer_inventory as cust_inv_svc
from app.services import orders as orders_svc
from app.services.audit_logs import log_action

_col = Collection("claims.json")


def list_claims() -> list[dict]:
    return sorted(_col.list_all(), key=lambda r: r.get("id", 0), reverse=True)


def list_claims_for(current_user: dict) -> list[dict]:
    from app.services.users import list_users
    role = current_user.get("role")
    username = current_user.get("username")
    all_claims = list_claims()
    if role in ("admin", "procurement_officer", "inventory_controller", "finance_officer"):
        return all_claims
    if role == "customer":
        return [c for c in all_claims if c.get("customer_username") == username]
    if role == "vendor_order_manager":
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
        return [c for c in all_claims if c.get("vendor_username") in vendor_usernames]
    if role == "vendor_claim_handler":
        from app.services.users import get_user_by_username
        handler = get_user_by_username(username, safe=False) or {}
        handler_company = handler.get("company_name") or ""
        all_vendor_users = list_users(safe=False)
        if handler_company:
            vendor_usernames = {
                u["username"] for u in all_vendor_users
                if u.get("role") in ("vendor", "vendor_order_manager", "vendor_claim_handler")
                and u.get("company_name") == handler_company
            }
        else:
            vendor_usernames = {
                u["username"] for u in all_vendor_users
                if u.get("role") in ("vendor_order_manager", "vendor_claim_handler")
            }
        return [c for c in all_claims if c.get("vendor_username") in vendor_usernames]
    return []


def get_claim(claim_id: int) -> dict | None:
    return _col.get(claim_id)


def _company_name_for(username: str) -> str:
    """Return the company_name for a user, falling back to their display_name then username."""
    from app.services.users import get_user_by_username
    if not username:
        return ""
    u = get_user_by_username(username, safe=True) or {}
    return u.get("company_name") or u.get("display_name") or username


def _next_claim_number() -> str:
    claims = _col.list_all()
    if claims:
        max_n = max(
            int(c["claim_number"].split("-")[1])
            for c in claims
            if c.get("claim_number", "").startswith("CLM-")
        )
        return f"CLM-{max_n + 1:04d}"
    return "CLM-0001"


def create_claim(customer_username: str, order_id: int, sku: str, damage_type: str,
                 damaged_qty: int, claim_text: str, actor: str,
                 vendor_username: str = "", order_number: str = "",
                 claim_value: float | None = None, cost_per_unit: float | None = None,
                 claim_percentage: int = 100, email_draft: str | None = None) -> dict:
    """Customer raises a claim against their own delivered order."""
    order = orders_svc.get_order(order_id) if order_id else None
    # For PO-based cases the ai-agent passes order_id=None or a PO id that
    # doesn't exist in the orders table — allow it through with hint data.
    if not order and actor != "ai-agent":
        raise ValueError("order_not_found")
    if order and actor != "ai-agent" and order.get("customer_username") != customer_username:
        raise ValueError("forbidden")

    # Use the order's stored values as canonical; fall back to caller-provided hints.
    resolved_customer = (order.get("customer_username") if order else None) or customer_username
    resolved_vendor = (order.get("vendor_username") if order else None) or vendor_username
    resolved_order_number = (order.get("order_number") if order else None) or order_number or str(order_id or "")
    vendor_company = _company_name_for(resolved_vendor)
    customer_company = _company_name_for(resolved_customer)

    record = _col.create({
        "claim_number": _next_claim_number(),
        "customer_username": resolved_customer,
        "customer_company_name": customer_company,
        "vendor_username": resolved_vendor,
        "vendor_company_name": vendor_company,
        "order_id": order_id,
        "order_number": resolved_order_number,
        "sku": sku,
        "damage_type": damage_type,
        "damaged_qty": damaged_qty,
        "claim_text": claim_text,
        "cost_per_unit": cost_per_unit,
        "claim_value": claim_value,
        "claim_percentage": claim_percentage,
        "email_draft": email_draft,
        "status": "pending",
        "decision_reason": None,
    })
    log_action(actor, "create", "claims", record["id"],
               f"claim {record['claim_number']} on order {resolved_order_number}")
    alerts_svc.create_alert(
        audience="vendor",
        target_username=resolved_vendor,
        type_="new_claim",
        title=f"New claim {record['claim_number']}",
        message=f"{customer_company} filed claim {record['claim_number']} on order {resolved_order_number}.",
        related_id=record["id"],
        actor=actor,
    )
    return record


def create_claim_from_po(finance_officer_username: str, po: dict, sku: str, damage_type: str,
                         damaged_qty: int, claim_text: str, actor: str,
                         claim_value: float | None = None) -> dict:
    """Finance officer raises a claim against a delivered purchase order."""
    po_vendor = po.get("vendor_username", "")
    vendor_company = _company_name_for(po_vendor)
    customer_company = _company_name_for(finance_officer_username)
    record = _col.create({
        "claim_number": _next_claim_number(),
        "customer_username": finance_officer_username,
        "customer_company_name": customer_company,
        "vendor_username": po_vendor,
        "vendor_company_name": vendor_company,
        "order_id": None,
        "order_number": po.get("po_number"),
        "sku": sku,
        "damage_type": damage_type,
        "damaged_qty": damaged_qty,
        "claim_text": claim_text,
        "claim_value": claim_value,
        "status": "pending",
        "decision_reason": None,
    })
    log_action(actor, "create", "claims", record["id"],
               f"PO claim {record['claim_number']} on PO {po.get('po_number')}")
    alerts_svc.create_alert(
        audience="vendor",
        target_username=po_vendor,
        type_="new_claim",
        title=f"New claim {record['claim_number']}",
        message=f"{customer_company} filed claim {record['claim_number']} against PO {po.get('po_number')}.",
        related_id=record["id"],
        actor=actor,
    )
    return record


def decide_claim(claim_id: int, vendor_username: str, status: str, decision_reason: str | None, actor: str, bypass_vendor_check: bool = False) -> dict | None:
    from app.services.users import list_users, get_user_by_username
    claim = get_claim(claim_id)
    if not claim:
        return None

    # Resolve which vendor org the actor belongs to, then check the claim's vendor is in that org.
    actor_user = get_user_by_username(vendor_username, safe=False) or {}
    actor_company = actor_user.get("company_name") or ""
    all_vendor_users = list_users(safe=False)
    if actor_company:
        authorised_vendor_usernames = {
            u["username"] for u in all_vendor_users
            if u.get("role") in ("vendor", "vendor_order_manager", "vendor_claim_handler")
            and (u.get("company_name") or "") == actor_company
        }
        authorised_vendor_usernames.add(vendor_username)
    else:
        authorised_vendor_usernames = {
            u["username"] for u in all_vendor_users
            if u.get("role") in ("vendor", "vendor_order_manager", "vendor_claim_handler")
        }
    if not bypass_vendor_check and claim.get("vendor_username") not in authorised_vendor_usernames:
        raise ValueError("forbidden")

    record = _col.update(claim_id, {"status": status, "decision_reason": decision_reason})
    log_action(actor, "update", "claims", claim_id, f"decision -> {status}: {decision_reason}")

    if status == "approved":
        cust_inv_svc.reduce_qty(
            customer_username=claim["customer_username"],
            vendor_username=claim["vendor_username"],
            sku=claim["sku"],
            qty=claim.get("damaged_qty", 0),
            actor=actor,
        )

    # Use company name in the alert message if available.
    vendor_user = get_user_by_username(claim.get("vendor_username", ""), safe=True) or {}
    vendor_label = vendor_user.get("company_name") or vendor_user.get("display_name") or claim.get("vendor_username", "Vendor")

    alerts_svc.create_alert(
        audience="customer",
        target_username=claim["customer_username"],
        type_="claim_status_changed",
        title=f"Claim {record['claim_number']} {status}",
        message=f"Claim {record['claim_number']} against {vendor_label} was {status}."
                + (f" Reason: {decision_reason}" if decision_reason else ""),
        related_id=claim_id,
        actor=actor,
    )
    return record


def delete_claim(claim_id: int, actor: str = "system") -> bool:
    ok = _col.delete(claim_id)
    if ok:
        log_action(actor, "delete", "claims", claim_id, "deleted claim")
    return ok
