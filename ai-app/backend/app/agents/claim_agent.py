"""
Claim Agent — drafts a claim narrative via Groq and files it with the ERP
(create_claim MCP tool) only if the Policy Agent determined the customer is
eligible. create_claim already raises a "new_claim" alert to the vendor
server-side (see erp-app/backend/app/services/claims.py) — no separate
alert call needed here.

Skip condition: Policy Agent says eligible_for_claim=false. Inventory/
Reorder/Governance still run regardless — the damaged stock still needs
tracking/replacing even without a claim.
"""
from __future__ import annotations

import logging

from app import observability
from app.mcp_client import ErpMcpClient, McpClientError
from app.providers import groq_client

logger = logging.getLogger("ai_app.agents.claim")

DRAFT_SYSTEM_PROMPT = (
    "You are a freight claims drafting assistant. Given case facts, a liability determination, "
    "and an SLA-derived claim entitlement percentage, draft a professional claim narrative "
    "(3-5 sentences). The narrative MUST explicitly: "
    "(1) state the damage facts (order/PO, item, damage type, quantities), "
    "(2) cite the specific SLA clause or criteria under which the claim is being raised, "
    "(3) state the claim entitlement percentage (e.g. '80% of the damaged item value as per "
    "Section X of the SLA') and the resulting claim value in ₹ if provided. "
    "Respond with ONLY the narrative text — no prose framing, no markdown, no quotes."
)

EMAIL_SYSTEM_PROMPT = (
    "You are a professional freight claims correspondent. Draft a formal claim letter email "
    "from the customer company (Freight ERP) to the vendor company. "
    "Use standard business email format: Subject line, date placeholder, salutation, "
    "structured body paragraphs, and a professional closing with signature block. "
    "The email MUST: "
    "(1) open with a clear statement of the claim being raised against the vendor, "
    "(2) describe the damage facts (order/PO number, SKU, item name, damage type, quantities affected), "
    "(3) cite the SPECIFIC SLA clause, section, or policy excerpt that entitles the customer to raise "
    "this claim — quote the relevant SLA language verbatim if provided, "
    "(4) explicitly state the SLA-derived claim entitlement percentage (e.g. 'As per Section X of the "
    "SLA, we are entitled to claim 80% of the damaged item value') — if 100%, state that the full "
    "value is claimed as no cap is specified in the SLA, "
    "(5) state the total claim value in ₹ and show how it was calculated "
    "(cost per unit × damaged quantity × entitlement %), "
    "(6) request a formal written response and resolution timeline within 7 business days. "
    "Respond with ONLY the complete email text — no markdown code fences, no commentary outside the email."
)


async def run_claim(mcp_client: ErpMcpClient, case: dict, policy_result: dict | None, run_id: str | None = None) -> dict:
    """case is the Context Structuring Agent's output; policy_result is the Policy Agent's
    {liable, eligible_for_claim, justification, confidence} dict. run_id (optional): threaded
    down for Langfuse tracing — see app/observability.py.
    Returns {claim: dict|None, skipped: bool, skip_reason: str|None, raw: dict,
    status: 'ok'|'failed', error: str|None}."""
    raw: dict = {"draft": None, "create_claim": None, "duplicate_check": None}

    if not policy_result or not policy_result.get("eligible_for_claim"):
        return {
            "claim": None,
            "skipped": True,
            "skip_reason": "Not eligible for a claim per the Policy Agent's determination.",
            "raw": raw, "status": "ok", "error": None,
        }

    # ── Duplicate check: has a claim already been filed for this PO + SKU? ──
    po_number = case.get("order_number") or ""
    sku = case.get("sku") or ""
    if po_number and sku:
        try:
            existing = await mcp_client.find_claim_by_po_and_sku(po_number, sku)
            raw["duplicate_check"] = existing
            if existing:
                existing["confidence"] = policy_result.get("confidence", 100)
                existing["already_filed"] = True
                existing["notice"] = f"Claim is already generated for PO '{po_number}' and SKU '{sku}' (Claim {existing.get('claim_number', existing.get('id'))})."
                return {
                    "claim": existing,
                    "skipped": False,
                    "skip_reason": None,
                    "raw": raw, "status": "ok", "error": None,
                }
        except McpClientError as exc:
            logger.warning("Duplicate claim check failed for %s/%s: %s", po_number, sku, exc)

    # ── Claim value calculation ───────────────────────────────────────────────
    claim_percentage: int = policy_result.get("claim_percentage", 100)
    claim_value: float | None = None
    cost_per_unit: float | None = None
    po_order_number = case.get("order_number", "")
    if po_order_number.startswith("PO-"):
        try:
            po = await mcp_client.get_purchase_order_by_number(po_order_number)
            if po:
                total_cost = po.get("total_cost") or 0
                quantity = po.get("quantity") or po.get("item_quantity") or 0
                if total_cost and quantity:
                    cost_per_unit = round(total_cost / quantity, 2)
                    full_value = cost_per_unit * case["damaged_qty"]
                    claim_value = round(full_value * claim_percentage / 100, 2)
        except Exception as exc:
            logger.warning("Could not calculate claim value from PO %s: %s", po_order_number, exc)

    claim_value_for_draft = f"₹{claim_value:,.2f}" if claim_value is not None else "to be assessed"
    pct_source = "as per the SLA clause cited above" if claim_percentage < 100 else "full value — no SLA cap specified"
    draft_prompt = (
        f"Order: {case['order_number']}\nItem: {case['item_name']} (SKU {case['sku']})\n"
        f"Damage type: {case['damage_type']}\nDamaged quantity: {case['damaged_qty']} of {case['ordered_qty']}\n"
        f"Liability determination: {policy_result.get('liable')}\n"
        f"SLA criteria / justification: {policy_result.get('justification')}\n"
        f"Claim entitlement: {claim_percentage}% of damaged item value ({pct_source})\n"
        f"Claim value: {claim_value_for_draft}\n\n"
        "Draft the claim narrative per the instructions."
    )
    trace_id = observability.trace_id_for(run_id) if run_id else None
    draft_result = groq_client.reasoning_chat(
        DRAFT_SYSTEM_PROMPT, draft_prompt, temperature=0.3, trace_id=trace_id, name="claim_draft"
    )
    raw["draft"] = draft_result

    if draft_result["status"] != "ok" or not draft_result["content"]:
        return {
            "claim": None,
            "skipped": False,
            "skip_reason": None,
            "raw": raw,
            "status": "failed",
            "error": f"Claim drafting failed: {draft_result.get('error')}",
        }

    narrative = draft_result["content"].strip()

    # ── Resolve vendor display name early for email + alerts ─────────────────
    vendor_username = case.get("vendor_username", "")
    vendor_display = vendor_username
    if vendor_username:
        try:
            vendor_user = await mcp_client.get_user_by_username(vendor_username)
            vendor_display = (vendor_user or {}).get("company_name") or (vendor_user or {}).get("display_name") or vendor_username
        except Exception as exc:
            logger.warning("Could not resolve vendor display name for email: %s", exc)

    customer_username = case.get("customer_username", "")
    customer_display = customer_username
    try:
        customer_user = await mcp_client.get_user_by_username(customer_username)
        customer_display = (customer_user or {}).get("company_name") or (customer_user or {}).get("display_name") or customer_username
    except Exception as exc:
        logger.warning("Could not resolve customer display name for email: %s", exc)

    # ── Generate professional claim email draft ───────────────────────────────
    email_draft: str | None = None
    claim_value_str = f"₹{claim_value:,.2f}" if claim_value is not None else "To be assessed"
    pct_note = (
        f"{claim_percentage}% of total damaged item value (as per SLA clause)"
        if claim_percentage < 100
        else "100% of total damaged item value (no SLA cap specified)"
    )
    email_prompt = (
        f"From Company: {customer_display}\n"
        f"To Company (Vendor): {vendor_display}\n"
        f"Order / PO Number: {case['order_number']}\n"
        f"Item: {case['item_name']} (SKU: {case['sku']})\n"
        f"Damage Type: {case['damage_type']}\n"
        f"Damaged Quantity: {case['damaged_qty']} of {case['ordered_qty']} units\n"
        f"Claim Entitlement: {pct_note}\n"
        f"Claim Value: {claim_value_str}\n"
        f"SLA / Policy Basis: {policy_result.get('justification', 'As per the vendor SLA agreement in force.')}\n"
        f"Claim Narrative: {narrative}\n\n"
        "Draft the formal claim email now."
    )
    email_result = groq_client.reasoning_chat(
        EMAIL_SYSTEM_PROMPT, email_prompt, temperature=0.3,
        trace_id=observability.trace_id_for(run_id) if run_id else None,
        name="claim_email_draft",
    )
    raw["email_draft"] = email_result
    if email_result["status"] == "ok" and email_result.get("content"):
        email_draft = email_result["content"].strip()

    # For PO-based cases the order_id is a PO id, not an order id.
    # Pass None so the service uses the order_number hint instead of failing.
    order_number = case.get("order_number", "")
    is_po_based = order_number.startswith("PO-")
    effective_order_id = None if is_po_based else case["order_id"]

    try:
        claim_record = await mcp_client.create_claim(
            customer_username=case["customer_username"],
            order_id=effective_order_id,
            sku=case["sku"],
            damage_type=case["damage_type"],
            damaged_qty=case["damaged_qty"],
            claim_text=narrative,
            vendor_username=vendor_username,
            order_number=order_number,
            claim_value=claim_value,
            cost_per_unit=cost_per_unit,
            claim_percentage=claim_percentage,
            email_draft=email_draft,
        )
        raw["create_claim"] = claim_record
    except McpClientError as exc:
        return {
            "claim": None, "skipped": False, "skip_reason": None, "raw": raw,
            "status": "failed", "error": f"create_claim MCP call failed: {exc}",
        }

    # The file/skip decision is a deterministic rule over Policy's judgment — confidence is
    # inherited from there rather than independently re-judged here.
    claim_record["confidence"] = policy_result.get("confidence", 100)

    # ── Alerts ────────────────────────────────────────────────────────────────
    damaged_qty = case.get("damaged_qty", 0)
    item_name = case.get("item_name", "")
    claim_sku = case.get("sku", "")
    claim_order_number = case.get("order_number", "")

    try:
        await mcp_client.create_alert(
            audience="admin",
            target_username=None,
            type="claim_raised",
            title=f"Claim Raised — {item_name}",
            message=(
                f"Freight ERP has raised a claim for {damaged_qty} damaged unit(s) of "
                f"'{item_name}' (SKU: {claim_sku}) against PO {claim_order_number} "
                f"against {vendor_display}."
            ),
            related_id=claim_record.get("id"),
        )
    except Exception as exc:
        logger.warning("Failed to send admin claim alert: %s", exc)

    if vendor_username:
        # Send a single alert to the vendor (order manager account)
        try:
            await mcp_client.create_alert(
                audience="vendor",
                target_username=vendor_username,
                type="claim_raised",
                title="Claim Raised Against Your PO",
                message=(
                    f"Freight ERP has raised a claim against PO {claim_order_number} "
                    f"and SKU {claim_sku}."
                ),
                related_id=claim_record.get("id"),
            )
        except Exception as exc:
            logger.warning("Failed to send vendor claim alert to %s: %s", vendor_username, exc)

    return {"claim": claim_record, "skipped": False, "skip_reason": None, "raw": raw, "status": "ok", "error": None}
