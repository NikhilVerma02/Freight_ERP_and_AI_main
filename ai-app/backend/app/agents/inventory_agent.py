"""
Inventory Agent — tool/API-grounded, no LLM call.

1. Looks up the PO by number; if inventory_added is already True for this
   PO+SKU combination, skips the booking and returns an "already added" notice.
2. Calculates undamaged units = ordered_qty - damaged_qty and writes them
   into the vendor's ERP inventory via MCP.
3. Marks the PO as inventory_added = True so the Delivered Orders page
   reflects the change and duplicate runs are blocked.
4. Classifies risk as safe / warning / critical.
"""
from __future__ import annotations

import logging

from app.mcp_client import ErpMcpClient, McpClientError

logger = logging.getLogger("ai_app.agents.inventory")


async def run_inventory(mcp_client: ErpMcpClient, case: dict) -> dict:
    raw: dict = {"vendor_inventory": None, "po": None, "inventory_update": None}

    vendor_username = case["vendor_username"]
    sku = case["sku"]
    damaged_qty = case["damaged_qty"]
    ordered_qty = case.get("ordered_qty") or 0
    item_name = case.get("item_name") or sku
    po_number = case.get("po_number") or case.get("order_number") or ""

    # ── 1. Check if this PO has already had inventory booked ─────────────────
    po = None
    po_lookup_error = None
    if po_number:
        try:
            po = await mcp_client.get_purchase_order_by_number(po_number)
            raw["po"] = po
        except McpClientError as exc:
            po_lookup_error = str(exc)
            logger.warning("PO lookup failed for %s: %s", po_number, exc)

    if po and po.get("inventory_added"):
        # Already booked — return early with a clear notice
        try:
            vendor_items = await mcp_client.list_vendor_inventory(vendor_username)
            raw["vendor_inventory"] = vendor_items
        except McpClientError:
            vendor_items = []
        vendor_item = next((i for i in vendor_items if i.get("sku") == sku), None)
        return {
            "result": {
                "risk": "safe",
                "already_added": True,
                "notice": f"SKU '{sku}' with PO number '{po_number}' is already added in inventory. No duplicate booking made.",
                "vendor_qty_on_hand": vendor_item.get("qty_on_hand", 0) if vendor_item else 0,
                "vendor_reorder_threshold": vendor_item.get("reorder_threshold", 0) if vendor_item else 0,
                "vendor_below_threshold": False,
                "inventory_booked": False,
                "confidence": 100,
            },
            "raw": raw,
            "status": "ok",
            "error": None,
        }

    # ── 2. Current vendor warehouse stock ─────────────────────────────────────
    try:
        vendor_items = await mcp_client.list_vendor_inventory(vendor_username)
        raw["vendor_inventory"] = vendor_items
    except McpClientError as exc:
        return {"result": None, "raw": raw, "status": "failed", "error": f"Vendor inventory lookup failed: {exc}"}

    vendor_item = next((i for i in vendor_items if i.get("sku") == sku), None)
    vendor_qty_on_hand = vendor_item.get("qty_on_hand", 0) if vendor_item else 0
    vendor_reorder_threshold = vendor_item.get("reorder_threshold", 0) if vendor_item else 0
    vendor_below_threshold = vendor_qty_on_hand < vendor_reorder_threshold

    # ── 3. Book undamaged units into ERP vendor inventory ────────────────────
    undamaged_qty = max(0, ordered_qty - damaged_qty)
    inventory_update_result = None
    inventory_update_error = None

    if undamaged_qty > 0:
        try:
            inventory_update_result = await mcp_client.add_vendor_inventory(
                vendor_username=vendor_username,
                sku=sku,
                item_name=item_name,
                qty=undamaged_qty,
            )
            raw["inventory_update"] = inventory_update_result
            logger.info("Booked %d undamaged units of %s into ERP inventory for %s",
                        undamaged_qty, sku, vendor_username)
        except McpClientError as exc:
            inventory_update_error = str(exc)
            raw["inventory_update"] = {"error": inventory_update_error}
            logger.warning("Failed to book undamaged units: %s", exc)

    # ── 4. Inventory alert ────────────────────────────────────────────────────
    if inventory_update_result and undamaged_qty > 0:
        alert_message = (
            f"{undamaged_qty} unit(s) of '{item_name}' (SKU: {sku}) from PO {po_number or 'N/A'} "
            f"have been added to the Inventory."
        )
        alert_title = f"Inventory Updated — {item_name}"
        try:
            await mcp_client.create_alert(
                audience="admin", target_username=None,
                type="inventory_update", title=alert_title, message=alert_message,
            )
        except Exception as exc:
            logger.warning("Failed to send admin inventory alert: %s", exc)
        # Fan-out to every user at the vendor company
        try:
            vendor_users = await mcp_client.list_users_by_company(vendor_username)
        except Exception as exc:
            logger.warning("Could not resolve vendor company users for inventory alert: %s", exc)
            vendor_users = [{"username": vendor_username}]
        for vu in vendor_users:
            try:
                await mcp_client.create_alert(
                    audience="vendor", target_username=vu["username"],
                    type="inventory_update", title=alert_title, message=alert_message,
                )
            except Exception as exc:
                logger.warning("Failed to send vendor inventory alert to %s: %s", vu.get("username"), exc)

    # ── 5. Mark PO as inventory_added ────────────────────────────────────────
    if inventory_update_result and po_number:
        try:
            await mcp_client.mark_po_inventory_added(po_number)
            logger.info("Marked %s as inventory_added=True", po_number)
        except McpClientError as exc:
            logger.warning("Failed to mark PO inventory_added: %s", exc)

    # ── 6. Risk classification ────────────────────────────────────────────────
    qty_after_update = vendor_qty_on_hand + undamaged_qty

    if damaged_qty == 0:
        risk = "safe"
    elif qty_after_update == 0 or vendor_below_threshold:
        risk = "critical"
    else:
        risk = "warning"

    result = {
        "risk": risk,
        "already_added": False,
        "ordered_qty": ordered_qty,
        "damaged_qty": damaged_qty,
        "undamaged_qty": undamaged_qty,
        "vendor_qty_before": vendor_qty_on_hand,
        "customer_qty_after_damage": qty_after_update,
        "vendor_qty_on_hand": vendor_qty_on_hand,
        "vendor_reorder_threshold": vendor_reorder_threshold,
        "vendor_below_threshold": vendor_below_threshold,
        "inventory_booked": inventory_update_result is not None,
        "inventory_book_error": inventory_update_error,
        "po_number_checked": po_number or None,
        "po_lookup_error": po_lookup_error,
        "confidence": 100,
    }
    return {"result": result, "raw": raw, "status": "ok", "error": None}
