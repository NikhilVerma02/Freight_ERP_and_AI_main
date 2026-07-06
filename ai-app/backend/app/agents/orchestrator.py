"""
Pipeline orchestrator: Inspector -> Context -> Policy -> Inventory ->
Reorder -> Claim -> Governance, run sequentially. Each step is logged via
logging_store.log_step. Only the Inspector/Context agents' failures abort
the whole run (nothing downstream has a valid case without them); Policy/
Inventory/Reorder/Claim/Governance failures are logged and the run
continues so the UI can still show whatever succeeded.

Event-driven branches (steps marked status="skipped", with a `reason` in
their payload, rather than silently omitted or shown as a fake success):
  - No damage detected (Inspector reports damaged_qty <= 0/null): the run
    ends right there — Context/Policy/Inventory/Reorder/Claim/Governance
    never run. There's nothing for them to reconcile/assess/file against.
  - Not eligible for a claim (Policy Agent says eligible_for_claim=false):
    Claim Agent is skipped, but Inventory/Reorder/Governance still run —
    the damaged stock still needs tracking/replacing even without a claim.

run_pipeline_stream() is an async generator so the router can forward each
step's start/finish as an SSE event the instant it happens — the frontend
shows "executing" the moment an agent starts and the real extracted info
the moment it finishes, instead of waiting for the whole pipeline and then
faking a staggered reveal.
"""
from __future__ import annotations

import logging
import time
from typing import Any, AsyncIterator

from app import observability
from app.agents import claim_agent, context_agent, governance_agent, inspector_agent, inventory_agent, policy_agent, reorder_agent
from app.logging_store import create_run, finish_run, log_step, new_run_id
from app.mcp_client import ErpMcpClient, McpClientError

logger = logging.getLogger("ai_app.agents.orchestrator")


_DOWNSTREAM_STEPS = ("context", "policy", "inventory", "reorder", "claim", "governance")


def _skip_event(step: str, reason: str) -> dict[str, Any]:
    """A step that never ran because an earlier event-driven branch made it moot —
    status='skipped' (not 'ok') so the UI shows it distinctly from a real success."""
    return {"type": "step_done", "step": step, "status": "skipped", "error": None, "data": {"skipped": True, "reason": reason}}


def _tokens_from_envelope(envelope: dict | None) -> dict | None:
    if not envelope:
        return None
    return {
        "prompt_tokens": envelope.get("prompt_tokens"),
        "completion_tokens": envelope.get("completion_tokens"),
    }


async def run_pipeline_stream(
    mcp_client: ErpMcpClient,
    order_id: int,
    sku: str,
    files: list[dict],
    manual_transcript: str | None,
    actor_username: str,
    actor_role: str,
    hint_vendor_username: str = "",
    hint_customer_username: str = "",
) -> AsyncIterator[dict[str, Any]]:
    """files: list of {"data": bytes, "mime_type": str} (video/image/audio, any combination).
    order_id/sku come from the explicit picker on the upload form (not extracted).

    Yields one {"type": "step_start", "step": ...} immediately before each agent runs, then
    {"type": "step_done", "step": ..., "status", "error", "data"} immediately after — "data" is
    that agent's clean output payload (same shape persisted to agent_logs.json), never the raw
    LLM call envelopes. Ends with {"type": "run_complete", "run_id", "status"}.
    """
    run_id = new_run_id()
    case_summary = (manual_transcript or (f"{len(files)} media file(s) uploaded" if files else "no input"))[:200]
    create_run(run_id, case_summary, actor_username=actor_username, actor_role=actor_role)
    # Langfuse trace for the whole run — derived deterministically from run_id, so erp-app's
    # SLA RAG calls (triggered later, via MCP, from a different process) can independently
    # derive the SAME trace id and nest under it. See app/observability.py.
    observability.start_trace(
        observability.trace_id_for(run_id) or run_id,
        "claims_pipeline",
        metadata={"actor_username": actor_username, "actor_role": actor_role, "order_id": order_id, "sku": sku},
        input={"case_summary": case_summary},
    )

    # ---------------- Inspector ----------------
    yield {"type": "step_start", "step": "inspector"}
    t0 = time.perf_counter()
    try:
        inspector_out = await inspector_agent.run_inspection(files, manual_transcript, run_id=run_id)
    except Exception as exc:
        logger.exception("inspector_agent raised unexpectedly")
        inspector_out = {"extracted": None, "raw": {}, "status": "failed", "error": str(exc)}
    latency_ms = (time.perf_counter() - t0) * 1000

    extract_envelope = (inspector_out.get("raw") or {}).get("extract")
    log_step(
        run_id, "inspector_agent",
        input_summary={"order_id": order_id, "sku": sku, "file_count": len(files), "manual_transcript": bool(manual_transcript)},
        output_summary=inspector_out.get("extracted"),
        status=inspector_out["status"],
        latency_ms=latency_ms,
        model=extract_envelope.get("model") if extract_envelope else None,
        tokens=_tokens_from_envelope(extract_envelope),
        error=inspector_out.get("error"),
    )
    yield {"type": "step_done", "step": "inspector", "status": inspector_out["status"], "error": inspector_out.get("error"), "data": inspector_out.get("extracted")}

    if inspector_out["status"] != "ok":
        finish_run(run_id, "failed")
        yield {"type": "run_complete", "run_id": run_id, "status": "failed"}
        return

    # Event-driven branch #1: no damage found in the evidence — nothing for the rest of the
    # pipeline to do (no case to reconcile, no policy to check, no stock to track/replace).
    damaged_qty = (inspector_out.get("extracted") or {}).get("damaged_qty")
    if not damaged_qty or damaged_qty <= 0:
        reason = "No damaged units were detected in the submitted evidence — pipeline ended after the Inspector Agent."
        for step in _DOWNSTREAM_STEPS:
            yield _skip_event(step, reason)
            log_step(
                run_id, f"{step}_agent", input_summary={"order_id": order_id, "sku": sku},
                output_summary={"skipped": True, "reason": reason}, status="skipped",
                latency_ms=None, model=None, tokens=None, error=None,
            )
        finish_run(run_id, "completed")
        observability.flush()
        yield {"type": "run_complete", "run_id": run_id, "status": "completed"}
        return

    # ---------------- Order fetch (shared by PO-validation and Context steps) ----------------
    def _order_from_po(po: dict) -> dict:
        return {
            "id": po["id"],
            "order_number": po.get("po_number", f"PO-{po['id']}"),
            "vendor_username": po.get("vendor_username", ""),
            "customer_username": po.get("customer_username", "") or "",
            "items": [{"sku": po.get("sku", ""), "item_name": po.get("item_name", ""), "qty": po.get("quantity", 0)}],
            "status": "delivered",
        }

    try:
        order = await mcp_client.get_order_by_id(order_id)
        order_has_items = order and isinstance(order.get("items"), list) and len(order.get("items", [])) > 0
        if not order or not order_has_items:
            po = await mcp_client.get_purchase_order_by_id(order_id)
            if po:
                order = _order_from_po(po)
            elif not order_has_items:
                order = None
    except McpClientError as exc:
        order = None
        order_error = str(exc)
    else:
        order_error = None if order else f"Order {order_id} not found"

    # Event-driven branch #2: PO number stated in the evidence doesn't match the selected order.
    # The user likely uploaded evidence for a different shipment — abort immediately so a claim
    # is never filed against the wrong order.
    def _normalize_po(value: str) -> str:
        """Strip common PO prefixes and whitespace so '0004', 'PO-0004', 'PO 0004' all compare equal."""
        import re
        return re.sub(r"^(po[-\s]?|ord[-\s]?)", "", value.strip().lower())

    stated_po = (inspector_out.get("extracted") or {}).get("po_number")
    if stated_po and order:
        selected_order_number = (order.get("order_number") or "").strip()
        if _normalize_po(stated_po) != _normalize_po(selected_order_number):
            po_mismatch_error = (
                f"PO number mismatch: the evidence references '{stated_po}' but the order you "
                f"selected is '{selected_order_number}'. Please upload the correct evidence for "
                f"this order and try again."
            )
            log_step(
                run_id, "inspector_agent",
                input_summary={"order_id": order_id, "sku": sku},
                output_summary={"po_mismatch": True, "stated_po": stated_po, "selected_order": selected_order_number},
                status="failed", latency_ms=None, model=None, tokens=None, error=po_mismatch_error,
            )
            for step in _DOWNSTREAM_STEPS:
                yield _skip_event(step, po_mismatch_error)
                log_step(
                    run_id, f"{step}_agent", input_summary={"order_id": order_id, "sku": sku},
                    output_summary={"skipped": True, "reason": po_mismatch_error}, status="skipped",
                    latency_ms=None, model=None, tokens=None, error=None,
                )
            finish_run(run_id, "failed")
            observability.flush()
            yield {"type": "run_complete", "run_id": run_id, "status": "po_mismatch", "error": po_mismatch_error}
            return

    # ---------------- Context Structuring ----------------
    yield {"type": "step_start", "step": "context"}
    t0 = time.perf_counter()

    if order is None:
        log_step(
            run_id, "context_agent",
            input_summary={"order_id": order_id, "sku": sku},
            output_summary=None, status="failed", latency_ms=(time.perf_counter() - t0) * 1000,
            model=None, tokens=None, error=order_error,
        )
        yield {"type": "step_done", "step": "context", "status": "failed", "error": order_error, "data": None}
        finish_run(run_id, "failed")
        yield {"type": "run_complete", "run_id": run_id, "status": "failed"}
        return

    # Apply intake-form hints for fields the stored order is missing.
    # The user explicitly selected the vendor/customer on the form — use their selection
    # when the order record itself has no vendor assigned (e.g. admin-created unlinked order).
    if hint_vendor_username and not order.get("vendor_username"):
        order = {**order, "vendor_username": hint_vendor_username}
    if hint_customer_username and not order.get("customer_username"):
        order = {**order, "customer_username": hint_customer_username}

    try:
        context_out = await context_agent.run_context_structuring(inspector_out["extracted"], order, sku, run_id=run_id)
    except Exception as exc:
        logger.exception("context_agent raised unexpectedly")
        context_out = {"case": None, "raw": {}, "status": "failed", "error": str(exc)}
    latency_ms = (time.perf_counter() - t0) * 1000

    summary_envelope = (context_out.get("raw") or {}).get("summary")
    log_step(
        run_id, "context_agent",
        input_summary={"order_id": order_id, "sku": sku},
        output_summary=context_out.get("case"),
        status=context_out["status"],
        latency_ms=latency_ms,
        model=summary_envelope.get("model") if summary_envelope else None,
        tokens=_tokens_from_envelope(summary_envelope),
        error=context_out.get("error"),
    )
    yield {"type": "step_done", "step": "context", "status": context_out["status"], "error": context_out.get("error"), "data": context_out.get("case")}

    if context_out["status"] != "ok":
        finish_run(run_id, "failed")
        yield {"type": "run_complete", "run_id": run_id, "status": "failed"}
        return

    case = context_out["case"]
    overall_status = "completed"

    # ---------------- Policy ----------------
    yield {"type": "step_start", "step": "policy"}
    t0 = time.perf_counter()
    try:
        policy_out = await policy_agent.run_policy(mcp_client, case, run_id=run_id)
    except Exception as exc:
        logger.exception("policy_agent raised unexpectedly")
        policy_out = {"result": None, "raw": {}, "status": "failed", "error": str(exc)}
    latency_ms = (time.perf_counter() - t0) * 1000

    reasoning_envelope = (policy_out.get("raw") or {}).get("reasoning")
    log_step(
        run_id, "policy_agent",
        input_summary={"order_id": order_id, "sku": sku, "damage_type": case["damage_type"]},
        output_summary=policy_out.get("result"),
        status=policy_out["status"],
        latency_ms=latency_ms,
        model=reasoning_envelope.get("model") if reasoning_envelope else None,
        tokens=_tokens_from_envelope(reasoning_envelope),
        error=policy_out.get("error"),
    )
    yield {"type": "step_done", "step": "policy", "status": policy_out["status"], "error": policy_out.get("error"), "data": policy_out.get("result")}
    if policy_out["status"] != "ok":
        overall_status = "partial"

    # ---------------- Inventory ----------------
    yield {"type": "step_start", "step": "inventory"}
    t0 = time.perf_counter()
    try:
        inventory_out = await inventory_agent.run_inventory(mcp_client, case)
    except Exception as exc:
        logger.exception("inventory_agent raised unexpectedly")
        inventory_out = {"result": None, "raw": {}, "status": "failed", "error": str(exc)}
    latency_ms = (time.perf_counter() - t0) * 1000

    log_step(
        run_id, "inventory_agent",
        input_summary={"customer_username": case["customer_username"], "vendor_username": case["vendor_username"], "sku": sku},
        output_summary=inventory_out.get("result"),
        status=inventory_out["status"],
        latency_ms=latency_ms,
        model=None,
        tokens=None,
        error=inventory_out.get("error"),
    )
    yield {"type": "step_done", "step": "inventory", "status": inventory_out["status"], "error": inventory_out.get("error"), "data": inventory_out.get("result")}
    if inventory_out["status"] != "ok":
        overall_status = "partial"

    # ---------------- Reorder ----------------
    yield {"type": "step_start", "step": "reorder"}
    t0 = time.perf_counter()
    try:
        reorder_out = await reorder_agent.run_reorder(mcp_client, case, inventory_out.get("result"), run_id=run_id)
    except Exception as exc:
        logger.exception("reorder_agent raised unexpectedly")
        reorder_out = {"order": None, "skipped": False, "raw": {}, "status": "failed", "error": str(exc)}
    latency_ms = (time.perf_counter() - t0) * 1000

    note_envelope = (reorder_out.get("raw") or {}).get("note")
    log_step(
        run_id, "reorder_agent",
        input_summary={"sku": sku, "damaged_qty": case["damaged_qty"]},
        output_summary=reorder_out.get("order"),
        status="skipped" if reorder_out.get("skipped") else reorder_out["status"],
        latency_ms=latency_ms,
        model=note_envelope.get("model") if note_envelope else None,
        tokens=_tokens_from_envelope(note_envelope),
        error=reorder_out.get("error"),
    )
    if reorder_out.get("skipped"):
        yield _skip_event("reorder", "No units were damaged after reconciliation — no replacement stock needed.")
    else:
        yield {"type": "step_done", "step": "reorder", "status": reorder_out["status"], "error": reorder_out.get("error"), "data": reorder_out.get("order")}
        if reorder_out["status"] != "ok":
            overall_status = "partial"

    # ---------------- Claim ----------------
    yield {"type": "step_start", "step": "claim"}
    t0 = time.perf_counter()
    try:
        claim_out = await claim_agent.run_claim(mcp_client, case, policy_out.get("result"), run_id=run_id)
    except Exception as exc:
        logger.exception("claim_agent raised unexpectedly")
        claim_out = {"claim": None, "skipped": False, "raw": {}, "status": "failed", "error": str(exc)}
    latency_ms = (time.perf_counter() - t0) * 1000

    draft_envelope = (claim_out.get("raw") or {}).get("draft")
    _claim_log_summary = (
        {"skipped": True, "reason": claim_out.get("skip_reason")} if claim_out.get("skipped") else claim_out.get("claim")
    )
    log_step(
        run_id, "claim_agent",
        input_summary={"order_id": order_id, "sku": sku, "eligible_for_claim": (policy_out.get("result") or {}).get("eligible_for_claim")},
        output_summary=_claim_log_summary,
        status="skipped" if claim_out.get("skipped") else claim_out["status"],
        latency_ms=latency_ms,
        model=draft_envelope.get("model") if draft_envelope else None,
        tokens=_tokens_from_envelope(draft_envelope),
        error=claim_out.get("error"),
    )
    if claim_out.get("skipped"):
        yield _skip_event("claim", claim_out.get("skip_reason") or "Claim skipped.")
    else:
        yield {"type": "step_done", "step": "claim", "status": claim_out["status"], "error": claim_out.get("error"), "data": claim_out.get("claim")}
        if claim_out["status"] != "ok":
            overall_status = "partial"

    # ---------------- Governance / Summary ----------------
    yield {"type": "step_start", "step": "governance"}
    t0 = time.perf_counter()
    try:
        governance_out = await governance_agent.run_governance(
            mcp_client, case, policy_out.get("result"), inventory_out.get("result"), reorder_out, claim_out, run_id=run_id,
        )
    except Exception as exc:
        logger.exception("governance_agent raised unexpectedly")
        governance_out = {"summary": None, "raw": {}, "status": "failed", "error": str(exc)}
    latency_ms = (time.perf_counter() - t0) * 1000

    narrative_envelope = (governance_out.get("raw") or {}).get("narrative")
    log_step(
        run_id, "governance_agent",
        input_summary={"order_id": order_id, "sku": sku},
        output_summary=governance_out.get("summary"),
        status=governance_out["status"],
        latency_ms=latency_ms,
        model=narrative_envelope.get("model") if narrative_envelope else None,
        tokens=_tokens_from_envelope(narrative_envelope),
        error=governance_out.get("error"),
    )
    yield {"type": "step_done", "step": "governance", "status": governance_out["status"], "error": governance_out.get("error"), "data": governance_out.get("summary")}
    if governance_out["status"] != "ok":
        overall_status = "partial"

    claim_id = (claim_out.get("claim") or {}).get("id")
    alert_id = (governance_out.get("summary") or {}).get("inventory_alert_id")
    finish_run(run_id, overall_status, claim_id=claim_id, alert_id=alert_id)
    observability.flush()  # short-lived request — force-send buffered traces now rather than waiting on the SDK's batch timer
    yield {"type": "run_complete", "run_id": run_id, "status": overall_status}
