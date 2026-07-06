"""
Reorder Agent — auto-creates a real replacement-stock order with the vendor
for the damaged quantity (no approval step: confirmed product decision is
that this should show up immediately in both portals' Orders pages, same
as a normal order). Skipped entirely if no units were actually damaged.
"""
from __future__ import annotations

import logging

from app import observability
from app.mcp_client import ErpMcpClient, McpClientError
from app.providers import groq_client

logger = logging.getLogger("ai_app.agents.reorder")

NOTE_SYSTEM_PROMPT = (
    "You write a single short, professional note (max one sentence) explaining why a "
    "replacement-stock order was auto-generated for a customer, given the damage case facts. "
    "Respond with ONLY that sentence — no prose, no markdown, no quotes."
)


async def run_reorder(mcp_client: ErpMcpClient, case: dict, inventory_result: dict | None, run_id: str | None = None) -> dict:
    """case is the Context Structuring Agent's output. run_id (optional): threaded down for
    Langfuse tracing — see app/observability.py.
    Returns {order: dict|None, skipped: bool, raw: dict, status: 'ok'|'failed', error: str|None}."""
    raw: dict = {"note": None, "create_order": None}

    damaged_qty = case["damaged_qty"]
    if damaged_qty <= 0:
        return {"order": None, "skipped": True, "raw": raw, "status": "ok", "error": None}

    note_prompt = (
        f"{damaged_qty} unit(s) of '{case['item_name']}' were damaged ({case['damage_type']}) on order "
        f"{case['order_number']}. Inventory risk after damage: {(inventory_result or {}).get('risk', 'unknown')}."
    )
    trace_id = observability.trace_id_for(run_id) if run_id else None
    note_result = groq_client.reasoning_chat(NOTE_SYSTEM_PROMPT, note_prompt, temperature=0.2, trace_id=trace_id, name="reorder_note")
    raw["note"] = note_result
    note = (
        note_result["content"]
        if note_result["status"] == "ok" and note_result["content"]
        else f"Auto-generated to replace {damaged_qty} damaged unit(s) of {case['item_name']}."
    )

    vendor_username = case.get("vendor_username", "")
    original_po_number = case.get("order_number") or ""

    # ── Duplicate check ───────────────────────────────────────────────────────
    if original_po_number and vendor_username:
        try:
            existing_po = await mcp_client.find_reorder_by_source(
                vendor_username=vendor_username,
                sku=case["sku"],
                source_order_number=original_po_number,
            )
            if existing_po:
                existing_po["confidence"] = case.get("confidence", 100)
                existing_po["already_filed"] = True
                existing_po["notice"] = (
                    f"A reorder is already generated for PO '{original_po_number}' and "
                    f"SKU '{case['sku']}' (Reorder PO {existing_po.get('po_number', existing_po.get('id'))})."
                )
                if "order_number" not in existing_po and "po_number" in existing_po:
                    existing_po["order_number"] = existing_po["po_number"]
                return {"order": existing_po, "skipped": False, "raw": raw, "status": "ok", "error": None}
        except McpClientError as exc:
            logger.warning("Duplicate reorder check failed for %s/%s: %s", original_po_number, case["sku"], exc)

    # Always create a real PO in the ERP (visible in both ERP and Vendor portals)
    try:
        po_record = await mcp_client.create_purchase_order(
            vendor_username=vendor_username,
            sku=case["sku"],
            item_name=case["item_name"],
            quantity=damaged_qty,
            created_by="ai-agent",
            notes=note,
            source_order_number=original_po_number or None,
        )
        raw["create_order"] = po_record
    except McpClientError as exc:
        return {"order": None, "skipped": False, "raw": raw, "status": "failed", "error": f"create_purchase_order MCP call failed: {exc}"}

    po_record["confidence"] = case.get("confidence", 100)
    po_record["reorder_note"] = note
    # Normalise: frontend reads `order_number`; PO records use `po_number`
    if "order_number" not in po_record and "po_number" in po_record:
        po_record["order_number"] = po_record["po_number"]

    vendor_display = case.get("vendor_username", "")
    if vendor_display:
        try:
            vendor_user = await mcp_client.get_user_by_username(vendor_display)
            vendor_display = (
                (vendor_user or {}).get("company_name")
                or (vendor_user or {}).get("display_name")
                or vendor_display
            )
        except Exception as exc:
            logger.warning("Could not resolve vendor display name for reorder alert: %s", exc)

    try:
        await mcp_client.create_alert(
            audience="admin",
            target_username=None,
            type="reorder",
            title=f"Reorder Raised — {case['item_name']}",
            message=(
                f"Freight ERP has raised a Reorder for {damaged_qty} unit(s) of "
                f"'{case['item_name']}' (SKU: {case['sku']}) against PO {original_po_number or 'N/A'} "
                f"from {vendor_display}."
            ),
            related_id=po_record.get("id"),
        )
    except Exception as exc:
        logger.warning("Failed to send reorder alert: %s", exc)

    return {"order": po_record, "skipped": False, "raw": raw, "status": "ok", "error": None}
