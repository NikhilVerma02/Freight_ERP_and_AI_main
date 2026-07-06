from __future__ import annotations

from app.store import Collection
from app.services.audit_logs import log_action

_col = Collection("vendor_inventory.json")


def list_inventory(vendor_username: str | None = None) -> list[dict]:
    items = sorted(_col.list_all(), key=lambda r: r.get("id", 0))
    if vendor_username is not None:
        items = [i for i in items if i.get("vendor_username") == vendor_username]
    return items


def get_item(item_id: int) -> dict | None:
    return _col.get(item_id)


def get_by_sku(vendor_username: str, sku: str) -> dict | None:
    for item in _col.list_all():
        if item.get("vendor_username") == vendor_username and item.get("sku") == sku:
            return item
    return None


def add_qty(vendor_username: str, sku: str, item_name: str, qty: int, actor: str = "system") -> dict:
    """Increment (or create) the vendor's stock for a sku."""
    existing = get_by_sku(vendor_username, sku)
    if existing:
        new_qty = existing.get("qty_on_hand", 0) + qty
        record = _col.update(existing["id"], {"qty_on_hand": new_qty})
        log_action(actor, "update_qty", "vendor_inventory", existing["id"],
                   f"+{qty} -> {new_qty} for {vendor_username}/{sku}")
        return record
    record = _col.create({
        "vendor_username": vendor_username,
        "sku": sku,
        "item_name": item_name,
        "qty_on_hand": qty,
        "reorder_threshold": 0,
        "manufacturing_critical": False,
    })
    log_action(actor, "create", "vendor_inventory", record["id"],
               f"created {sku} qty={qty} for {vendor_username}")
    return record


def create_item(payload: dict, actor: str = "system") -> dict:
    record = _col.create(payload)
    log_action(actor, "create", "vendor_inventory", record["id"],
               f"created item {record.get('sku')} for {record.get('vendor_username')}")
    return record


def update_item(item_id: int, patch: dict, actor: str = "system") -> dict | None:
    record = _col.update(item_id, patch)
    if record is None:
        return None
    log_action(actor, "update", "vendor_inventory", item_id, f"updated item {record.get('sku')}: {patch}")
    return record


def delete_item(item_id: int, actor: str = "system") -> bool:
    ok = _col.delete(item_id)
    if ok:
        log_action(actor, "delete", "vendor_inventory", item_id, "deleted item")
    return ok
