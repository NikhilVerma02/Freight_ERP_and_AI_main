"""
Governance/Summary Agent — the final step. Combines every upstream agent's
output into one structured result + a short human-readable narrative for
the AI portal dashboard, and raises an inventory-risk alert to the vendor
if the Inventory Agent flagged warning/critical risk (the one alert type
not already raised automatically by create_order/create_claim).
"""
from __future__ import annotations

import logging

from app import observability
from app.agents.confidence import average_confidence
from app.mcp_client import ErpMcpClient, McpClientError
from app.providers import groq_client

logger = logging.getLogger("ai_app.agents.governance")

NARRATIVE_SYSTEM_PROMPT = (
    "You write a short (3-4 sentence) executive summary of a freight damage case for an "
    "operations dashboard, given the full agent pipeline's findings. Mention the outcome "
    "(claim filed or not, reorder placed or not, inventory risk level) plainly. Respond with "
    "ONLY the summary text — no prose framing, no markdown, no quotes."
)


async def run_governance(
    mcp_client: ErpMcpClient,
    case: dict,
    policy_result: dict | None,
    inventory_result: dict | None,
    reorder_out: dict,
    claim_out: dict,
    run_id: str | None = None,
) -> dict:
    """run_id (optional): threaded down for Langfuse tracing — see app/observability.py.
    Returns {summary: dict|None, raw: dict, status: 'ok'|'failed', error: str|None}."""
    raw: dict = {"narrative": None, "create_alert": None}

    risk = (inventory_result or {}).get("risk", "unknown")
    claim_filed = bool(claim_out.get("claim"))
    order_placed = bool(reorder_out.get("order"))

    alert_record = None
    if risk in ("warning", "critical"):
        alert_payload = {
            "audience": "vendor",
            "target_username": case["vendor_username"],
            "type": "inventory_risk",
            "title": f"Inventory risk ({risk}) — {case['item_name']}",
            "message": (
                f"After damage on order {case['order_number']}, customer {case['customer_username']}'s "
                f"stock of {case['item_name']} (SKU {case['sku']}) is at {risk} risk. "
                f"Remaining: {(inventory_result or {}).get('customer_qty_after_damage', '?')} units."
            ),
            "related_id": (reorder_out.get("order") or {}).get("id"),
        }
        try:
            alert_record = await mcp_client.create_alert(**alert_payload)
            raw["create_alert"] = alert_record
        except McpClientError as exc:
            logger.error("Governance create_alert failed: %s", exc)
            raw["create_alert"] = {"error": str(exc)}

    narrative_prompt = (
        f"Case: {case['case_summary']}\n"
        f"Liability: {(policy_result or {}).get('liable', 'unknown')} — "
        f"{(policy_result or {}).get('justification', 'n/a')}\n"
        f"Claim filed: {claim_filed}\n"
        f"Replacement order placed: {order_placed} (qty {case['damaged_qty']})\n"
        f"Inventory risk: {risk}\n"
        "Write the executive summary per the instructions."
    )
    trace_id = observability.trace_id_for(run_id) if run_id else None
    narrative_result = groq_client.reasoning_chat(
        NARRATIVE_SYSTEM_PROMPT, narrative_prompt, temperature=0.3, trace_id=trace_id, name="governance_narrative"
    )
    raw["narrative"] = narrative_result
    narrative = (
        narrative_result["content"].strip()
        if narrative_result["status"] == "ok" and narrative_result["content"]
        else case["case_summary"]
    )

    # Overall run confidence: the average of the three genuine judgment calls in this pipeline
    # (Inspector's evidence read, Context's reconciliation, Policy's SLA interpretation) — the
    # other agents' "confidence" fields are inherited/deterministic, not independent judgments,
    # so averaging them in would just dilute this number without adding real signal.
    overall_confidence = average_confidence(
        [case.get("inspector_confidence"), case.get("confidence"), (policy_result or {}).get("confidence")]
    )

    summary = {
        "case_summary": case["case_summary"],
        "narrative": narrative,
        "liable": (policy_result or {}).get("liable", "unknown"),
        "eligible_for_claim": bool((policy_result or {}).get("eligible_for_claim")),
        "claim_filed": claim_filed,
        "claim_id": (claim_out.get("claim") or {}).get("id"),
        "reorder_placed": order_placed,
        "reorder_order_id": (reorder_out.get("order") or {}).get("id"),
        "inventory_risk": risk,
        "inventory_alert_id": alert_record.get("id") if alert_record else None,
        "overall_confidence": overall_confidence,
    }
    return {"summary": summary, "raw": raw, "status": "ok", "error": None}
