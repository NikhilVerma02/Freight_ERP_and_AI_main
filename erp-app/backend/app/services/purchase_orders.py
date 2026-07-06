from __future__ import annotations

from app.store import Collection

_col = Collection("purchase_orders.json")


def get_purchase_order(po_id) -> dict | None:
    try:
        return _col.get(int(po_id))
    except (TypeError, ValueError):
        return None


def list_purchase_orders(vendor_username: str | None = None) -> list[dict]:
    orders = sorted(_col.list_all(), key=lambda r: r.get("date_raised", ""), reverse=True)
    if vendor_username is not None:
        orders = [o for o in orders if o.get("vendor_username") == vendor_username]
    return orders


def create_purchase_order(payload: dict) -> dict:
    return _col.create(payload)


def update_purchase_order(po_id, patch: dict) -> dict | None:
    try:
        return _col.update(int(po_id), patch)
    except (TypeError, ValueError):
        return None
