from __future__ import annotations

from app.store import Collection, now_iso
from app.services import alerts as alerts_svc
from app.services import customer_inventory as cust_inv_svc
from app.services import links as links_svc
from app.services.audit_logs import log_action

_col = Collection("orders.json")


def list_orders() -> list[dict]:
    return sorted(_col.list_all(), key=lambda r: r.get("id", 0), reverse=True)


def list_orders_for(current_user: dict) -> list[dict]:
    role = current_user.get("role")
    username = current_user.get("username")
    all_orders = list_orders()
    if role in ("admin", "procurement_officer", "inventory_controller", "finance_officer"):
        return all_orders
    if role == "customer":
        return [o for o in all_orders if o.get("customer_username") == username]
    if role in ("vendor_order_manager", "vendor_claim_handler"):
        from app.services.users import get_user_by_username, list_users
        user_rec = get_user_by_username(username, safe=False) or {}
        company = user_rec.get("company_name") or ""
        if company:
            # Collect vendor_usernames of all vendor accounts sharing the same company
            vendor_usernames = {
                u["username"] for u in list_users(safe=False)
                if u.get("company_name") == company
                   and u.get("role") in ("vendor", "vendor_order_manager", "vendor_claim_handler")
            }
        else:
            vendor_usernames = {username}
        return [o for o in all_orders if o.get("vendor_username") in vendor_usernames]
    return []


def get_order(order_id: int) -> dict | None:
    return _col.get(order_id)


def _next_order_number() -> str:
    orders = _col.list_all()
    if orders:
        max_n = max(
            int(o["order_number"].split("-")[1])
            for o in orders
            if o.get("order_number", "").startswith("ORD-")
        )
        return f"ORD-{max_n + 1:04d}"
    return "ORD-0001"


def create_order(customer_username: str, vendor_username: str | None, items, actor: str,
                 quantity: int | None = None, notes: str | None = None,
                 total_amount: float | None = None, required_by: str | None = None,
                 bypass_link_check: bool = False) -> dict:
    """Customer submits an order to ERP. vendor_username may be None (pending ERP assignment)."""
    if vendor_username and not bypass_link_check and not links_svc.is_linked(customer_username, vendor_username):
        raise ValueError("not_linked")
    row: dict = {
        "order_number": _next_order_number(),
        "customer_username": customer_username,
        "vendor_username": vendor_username,
        "items": items if items is not None else [],
        "status": "requested",
        "undelivered_reason": None,
        "requested_at": now_iso(),
    }
    if quantity is not None:
        row["quantity"] = quantity
    if notes is not None:
        row["notes"] = notes
    if total_amount is not None:
        row["total_amount"] = total_amount
    if required_by is not None:
        row["required_by"] = required_by
    record = _col.create(row)
    log_action(actor, "create", "orders", record["id"],
               f"order {record['order_number']} {customer_username} -> {vendor_username or 'ERP'}")
    if vendor_username:
        alerts_svc.create_alert(
            audience="vendor",
            target_username=vendor_username,
            type_="new_order",
            title=f"New order {record['order_number']}",
            message=f"{customer_username} placed order {record['order_number']}.",
            related_id=record["id"],
            actor=actor,
        )
    else:
        alerts_svc.create_alert(
            audience="admin",
            target_username=None,
            type_="new_order",
            title=f"New order {record['order_number']} — needs vendor assignment",
            message=f"{customer_username} submitted order {record['order_number']}. Please assign a vendor.",
            related_id=record["id"],
            actor=actor,
        )
    return record


def assign_vendor(order_id: int, vendor_username: str, actor: str) -> dict | None:
    """ERP staff assigns a vendor to an unassigned order."""
    record = _col.update(order_id, {"vendor_username": vendor_username})
    if not record:
        return None
    log_action(actor, "update", "orders", order_id, f"assigned vendor {vendor_username}")
    alerts_svc.create_alert(
        audience="vendor",
        target_username=vendor_username,
        type_="new_order",
        title=f"New order {record['order_number']}",
        message=f"Order {record['order_number']} has been assigned to you by ERP.",
        related_id=order_id,
        actor=actor,
    )
    return record


def update_status(order_id: int, vendor_username: str, status: str, undelivered_reason: str | None, actor: str) -> dict | None:
    """Vendor (must own the order) updates status."""
    order = get_order(order_id)
    if not order:
        return None
    if order.get("vendor_username") != vendor_username:
        raise ValueError("forbidden")
    patch: dict = {"status": status}
    patch["undelivered_reason"] = undelivered_reason if status == "undelivered" else None
    record = _col.update(order_id, patch)
    log_action(actor, "update", "orders", order_id, f"status -> {status}")

    if status == "delivered":
        for item in record.get("items", []):
            cust_inv_svc.add_qty(
                customer_username=record["customer_username"],
                vendor_username=record["vendor_username"],
                sku=item.get("sku"),
                item_name=item.get("item_name"),
                qty=item.get("qty", 0),
                actor=actor,
            )

    alerts_svc.create_alert(
        audience="customer",
        target_username=record["customer_username"],
        type_="order_status_changed",
        title=f"Order {record['order_number']} {status}",
        message=f"Order {record['order_number']} is now {status}."
                + (f" Reason: {undelivered_reason}" if undelivered_reason else ""),
        related_id=order_id,
        actor=actor,
    )
    return record


def delete_order(order_id: int, actor: str = "system") -> bool:
    ok = _col.delete(order_id)
    if ok:
        log_action(actor, "delete", "orders", order_id, "deleted order")
    return ok
