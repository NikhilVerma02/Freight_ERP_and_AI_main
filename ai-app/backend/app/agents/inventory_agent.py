"""
Inventory Agent — tool/API-grounded, no LLM call.

1. Looks up the PO; if inventory_added is already True, skips and returns early.
2. Calculates undamaged units = ordered_qty - damaged_qty and books them into
   the vendor's ERP inventory via MCP.
3. Marks the PO as inventory_added = True.
4. Reads daily_production_requirement from the ERP portal vendor_inventory record
   (set by admin/warehouse — not the vendor). Calculates how many days of
   factory production the post-shipment stock covers. If < 2 days, fires a
   CRITICAL production-halt alert to the ERP admin and the vendor.
5. Classifies risk as safe / warning / critical.
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

    # ── 1. Duplicate-booking guard ────────────────────────────────────────────
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

    # ── 2. Fetch current ERP vendor inventory ─────────────────────────────────
    try:
        vendor_items = await mcp_client.list_vendor_inventory(vendor_username)
        raw["vendor_inventory"] = vendor_items
    except McpClientError as exc:
        return {"result": None, "raw": raw, "status": "failed",
                "error": f"Vendor inventory lookup failed: {exc}"}

    vendor_item = next((i for i in vendor_items if i.get("sku") == sku), None)
    vendor_qty_on_hand     = vendor_item.get("qty_on_hand", 0)         if vendor_item else 0
    vendor_reorder_threshold = vendor_item.get("reorder_threshold", 0) if vendor_item else 0
    vendor_below_threshold = vendor_qty_on_hand < vendor_reorder_threshold
    # daily_production_requirement is set by ERP admin/warehouse on the inventory record
    daily_production_req   = vendor_item.get("daily_production_requirement", 0) if vendor_item else 0

    # ── 3. Book undamaged units into ERP inventory ────────────────────────────
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

    # ── 4. Resolve vendor company users (fan-out for alerts) ──────────────────
    try:
        vendor_users = await mcp_client.list_users_by_company(vendor_username)
    except Exception as exc:
        logger.warning("Could not resolve vendor company users: %s", exc)
        vendor_users = [{"username": vendor_username}]

    # ── 5. Standard inventory-update alert ───────────────────────────────────
    if inventory_update_result and undamaged_qty > 0:
        alert_title = f"Inventory Updated — {item_name}"
        alert_msg = (
            f"{undamaged_qty} unit(s) of '{item_name}' (SKU: {sku}) from PO {po_number or 'N/A'} "
            f"have been added to the ERP inventory."
        )
        try:
            await mcp_client.create_alert(
                audience="admin", target_username=None,
                type="inventory_update", title=alert_title, message=alert_msg,
            )
        except Exception as exc:
            logger.warning("Failed to send admin inventory alert: %s", exc)
        try:
            await mcp_client.create_alert(
                audience="vendor", target_username=vendor_username,
                type="inventory_update", title=alert_title, message=alert_msg,
            )
        except Exception as exc:
            logger.warning("Failed to send vendor inventory alert to %s: %s", vendor_username, exc)

    # ── 6. Production halt risk check (ERP inventory daily requirement) ───────
    # Post-shipment stock = what was already in ERP inventory + undamaged units arriving now.
    qty_after_update = vendor_qty_on_hand + undamaged_qty
    production_halt_risk = False
    days_of_production_covered: float | None = None

    if daily_production_req > 0:
        days_of_production_covered = round(qty_after_update / daily_production_req, 1)
        if days_of_production_covered < 2:
            production_halt_risk = True
            halt_title = f"CRITICAL: Production Halt Risk — {item_name}"
            halt_msg = (
                f"After processing damaged shipment (PO: {po_number or 'N/A'}), "
                f"ERP inventory of '{item_name}' (SKU: {sku}) covers only "
                f"{days_of_production_covered} day(s) of factory production "
                f"(daily requirement: {daily_production_req} units/day, "
                f"on-hand after booking: {qty_after_update} units). "
                f"Immediate resupply from vendor '{vendor_username}' is required "
                f"to prevent a manufacturing halt."
            )
            logger.warning(
                "Production halt risk for %s/%s: %.1f days covered (threshold: 2 days)",
                vendor_username, sku, days_of_production_covered,
            )
            try:
                await mcp_client.create_alert(
                    audience="admin", target_username=None,
                    type="production_halt_risk", title=halt_title, message=halt_msg,
                )
            except Exception as exc:
                logger.warning("Failed to send admin production halt alert: %s", exc)
            try:
                await mcp_client.create_alert(
                    audience="vendor", target_username=vendor_username,
                    type="production_halt_risk", title=halt_title, message=halt_msg,
                )
            except Exception as exc:
                logger.warning("Failed to send vendor halt alert to %s: %s", vendor_username, exc)

    # ── 7. Mark PO as inventory_added ────────────────────────────────────────
    if inventory_update_result and po_number:
        try:
            await mcp_client.mark_po_inventory_added(po_number)
            logger.info("Marked %s as inventory_added=True", po_number)
        except McpClientError as exc:
            logger.warning("Failed to mark PO inventory_added: %s", exc)

    # ── 8. Risk classification ────────────────────────────────────────────────
    if damaged_qty == 0:
        risk = "safe"
    elif production_halt_risk:
        risk = "critical"
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
        "vendor_qty_after": qty_after_update,
        "vendor_reorder_threshold": vendor_reorder_threshold,
        "vendor_below_threshold": vendor_below_threshold,
        "daily_production_requirement": daily_production_req,
        "days_of_production_covered": days_of_production_covered,
        "production_halt_risk": production_halt_risk,
        "inventory_booked": inventory_update_result is not None,
        "inventory_book_error": inventory_update_error,
        "po_number_checked": po_number or None,
        "po_lookup_error": po_lookup_error,
        "confidence": 100,
    }
    return {"result": result, "raw": raw, "status": "ok", "error": None}
