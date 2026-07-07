"""
LangGraph-based claims pipeline.

Graph topology:

  START
    │
  [inspector]  ── failed ──────────────────────────────► [abort]
    │                                                        │
    │ ok                                                     │
    ▼                                                        │
  [fetch_order] ── failed / po_mismatch ──────────────► [abort]
    │                                                        │
    │ no_damage                                              │
    ├─────────────────────────────────────────────────► [skip_all]
    │                                                        │
    │ ok                                                     │
    ▼                                                        ▼
  [context] ── failed ──────────────────────────────── [abort]
    │
    │ ok
    ▼
  [policy] → [inventory] → [reorder] → [claim] → [governance]
                                                       │
                                                      END

Each node appends {"type":"step_start"} and {"type":"step_done"} events to
state["events"] (accumulated via operator.add).  The orchestrator iterates
over graph.astream(stream_mode="updates") and re-yields those events as
the SSE stream — so the frontend protocol is unchanged.
"""
from __future__ import annotations

import logging
import operator
import re
import time
from typing import Annotated, Any

from langgraph.graph import END, StateGraph
from typing_extensions import TypedDict

from app import observability
from app.agents import (
    claim_agent,
    context_agent,
    governance_agent,
    inspector_agent,
    inventory_agent,
    policy_agent,
    reorder_agent,
)
from app.logging_store import log_step
from app.mcp_client import ErpMcpClient, McpClientError

logger = logging.getLogger("ai_app.agents.graph")

# ── State schema ──────────────────────────────────────────────────────────────

class PipelineState(TypedDict):
    # ── fixed inputs (set once at START, never mutated) ──────────────────────
    run_id: str
    order_id: int
    sku: str
    files: list[dict]
    manual_transcript: str | None
    actor_username: str
    actor_role: str
    hint_vendor_username: str
    hint_customer_username: str
    mcp_client: Any               # ErpMcpClient — passed by reference

    # ── per-agent outputs ─────────────────────────────────────────────────────
    inspector_out: dict | None
    order: dict | None
    order_error: str | None
    context_out: dict | None
    policy_out: dict | None
    inventory_out: dict | None
    reorder_out: dict | None
    claim_out: dict | None
    governance_out: dict | None

    # ── routing / control ─────────────────────────────────────────────────────
    route_decision: str           # set by each routing node
    abort_error: str | None       # human-readable reason for abort/po_mismatch

    # ── SSE events — operator.add means each node APPENDS; never overwrites ──
    events: Annotated[list[dict], operator.add]


# ── Helpers ───────────────────────────────────────────────────────────────────

_DOWNSTREAM_STEPS = ("context", "policy", "inventory", "reorder", "claim", "governance")


def _skip_event(step: str, reason: str) -> dict:
    return {
        "type": "step_done",
        "step": step,
        "status": "skipped",
        "error": None,
        "data": {"skipped": True, "reason": reason},
    }


def _tokens_from_envelope(envelope: dict | None) -> dict | None:
    if not envelope:
        return None
    return {
        "prompt_tokens": envelope.get("prompt_tokens"),
        "completion_tokens": envelope.get("completion_tokens"),
    }


def _normalize_po(value: str) -> str:
    return re.sub(r"^(po[-\s]?|ord[-\s]?)", "", value.strip().lower())


def _order_from_po(po: dict) -> dict:
    return {
        "id": po["id"],
        "order_number": po.get("po_number", f"PO-{po['id']}"),
        "vendor_username": po.get("vendor_username", ""),
        "customer_username": po.get("customer_username", "") or "",
        "items": [{"sku": po.get("sku", ""), "item_name": po.get("item_name", ""), "qty": po.get("quantity", 0)}],
        "status": "delivered",
    }


# ── Node: Inspector ───────────────────────────────────────────────────────────

async def node_inspector(state: PipelineState) -> dict:
    run_id   = state["run_id"]
    order_id = state["order_id"]
    sku      = state["sku"]

    events: list[dict] = [{"type": "step_start", "step": "inspector"}]

    t0 = time.perf_counter()
    try:
        out = await inspector_agent.run_inspection(
            state["files"], state["manual_transcript"], run_id=run_id
        )
    except Exception as exc:
        logger.exception("inspector_agent raised unexpectedly")
        out = {"extracted": None, "raw": {}, "status": "failed", "error": str(exc)}
    latency_ms = (time.perf_counter() - t0) * 1000

    envelope = (out.get("raw") or {}).get("extract")
    log_step(
        run_id, "inspector_agent",
        input_summary={"order_id": order_id, "sku": sku,
                       "file_count": len(state["files"]),
                       "manual_transcript": bool(state["manual_transcript"])},
        output_summary=out.get("extracted"),
        status=out["status"],
        latency_ms=latency_ms,
        model=envelope.get("model") if envelope else None,
        tokens=_tokens_from_envelope(envelope),
        error=out.get("error"),
    )

    events.append({
        "type": "step_done", "step": "inspector",
        "status": out["status"], "error": out.get("error"),
        "data": out.get("extracted"),
    })

    # Routing decision
    if out["status"] != "ok":
        route = "abort"
        abort_error = out.get("error") or "Inspector failed"
    else:
        damaged_qty = (out.get("extracted") or {}).get("damaged_qty")
        if not damaged_qty or damaged_qty <= 0:
            route = "no_damage"
            abort_error = None
        else:
            route = "ok"
            abort_error = None

    return {
        "inspector_out": out,
        "route_decision": route,
        "abort_error": abort_error,
        "events": events,
    }


def route_after_inspector(state: PipelineState) -> str:
    return state["route_decision"]   # "ok" | "no_damage" | "abort"


# ── Node: Fetch order + PO validation ────────────────────────────────────────

async def node_fetch_order(state: PipelineState) -> dict:
    run_id    = state["run_id"]
    order_id  = state["order_id"]
    sku       = state["sku"]
    mcp       = state["mcp_client"]

    events: list[dict] = []

    try:
        order = await mcp.get_order_by_id(order_id)
        order_has_items = order and isinstance(order.get("items"), list) and len(order.get("items", [])) > 0
        # If order found but the selected SKU is not in its items, prefer PO lookup
        # (PO and customer order can share the same integer id)
        order_has_sku = order_has_items and any(
            str(i.get("sku", "")).lower() == sku.lower()
            for i in (order.get("items") or [])
        )
        if not order or not order_has_items or not order_has_sku:
            po = await mcp.get_purchase_order_by_id(order_id)
            if po:
                order = _order_from_po(po)
            elif not order_has_items:
                order = None
    except McpClientError as exc:
        order = None
        order_error = str(exc)
    else:
        order_error = None if order else f"Order {order_id} not found"

    # Apply intake-form hints
    hint_vendor   = state.get("hint_vendor_username", "")
    hint_customer = state.get("hint_customer_username", "")
    if order:
        if hint_vendor and not order.get("vendor_username"):
            order = {**order, "vendor_username": hint_vendor}
        if hint_customer and not order.get("customer_username"):
            order = {**order, "customer_username": hint_customer}

    # PO mismatch check
    if order and order_error is None:
        stated_po = (state.get("inspector_out") or {}).get("extracted", {}) or {}
        stated_po = stated_po.get("po_number")
        if stated_po:
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
                    output_summary={"po_mismatch": True, "stated_po": stated_po,
                                    "selected_order": selected_order_number},
                    status="failed", latency_ms=None, model=None, tokens=None,
                    error=po_mismatch_error,
                )
                return {
                    "order": None,
                    "order_error": po_mismatch_error,
                    "route_decision": "po_mismatch",
                    "abort_error": po_mismatch_error,
                    "events": events,
                }

    route = "ok" if (order and order_error is None) else "abort"
    return {
        "order": order,
        "order_error": order_error,
        "route_decision": route,
        "abort_error": order_error if route == "abort" else None,
        "events": events,
    }


def route_after_fetch_order(state: PipelineState) -> str:
    return state["route_decision"]   # "ok" | "abort" | "po_mismatch"


# ── Node: Skip all downstream (no damage detected) ───────────────────────────

async def node_skip_all(state: PipelineState) -> dict:
    run_id   = state["run_id"]
    order_id = state["order_id"]
    sku      = state["sku"]
    reason   = "No damaged units were detected in the submitted evidence — pipeline ended after the Inspector Agent."

    events: list[dict] = []
    for step in _DOWNSTREAM_STEPS:
        events.append(_skip_event(step, reason))
        log_step(
            run_id, f"{step}_agent",
            input_summary={"order_id": order_id, "sku": sku},
            output_summary={"skipped": True, "reason": reason},
            status="skipped", latency_ms=None, model=None, tokens=None, error=None,
        )

    events.append({"type": "run_complete", "run_id": run_id, "status": "completed"})
    return {"route_decision": "done", "events": events}


# ── Node: Abort (po_mismatch or hard failure) ─────────────────────────────────

async def node_abort(state: PipelineState) -> dict:
    run_id   = state["run_id"]
    order_id = state["order_id"]
    sku      = state["sku"]
    is_po    = state["route_decision"] == "po_mismatch"
    error    = state.get("abort_error") or "Pipeline aborted"

    events: list[dict] = []
    run_status = "po_mismatch" if is_po else "failed"

    if is_po:
        for step in _DOWNSTREAM_STEPS:
            events.append(_skip_event(step, error))
            log_step(
                run_id, f"{step}_agent",
                input_summary={"order_id": order_id, "sku": sku},
                output_summary={"skipped": True, "reason": error},
                status="skipped", latency_ms=None, model=None, tokens=None, error=None,
            )

    events.append({"type": "run_complete", "run_id": run_id, "status": run_status,
                   "error": error if is_po else None})
    return {"route_decision": "done", "events": events}


# ── Node: Context ─────────────────────────────────────────────────────────────

async def node_context(state: PipelineState) -> dict:
    run_id   = state["run_id"]
    order_id = state["order_id"]
    sku      = state["sku"]

    events: list[dict] = [{"type": "step_start", "step": "context"}]

    t0 = time.perf_counter()
    try:
        out = await context_agent.run_context_structuring(
            state["inspector_out"]["extracted"], state["order"], sku, run_id=run_id
        )
    except Exception as exc:
        logger.exception("context_agent raised unexpectedly")
        out = {"case": None, "raw": {}, "status": "failed", "error": str(exc)}
    latency_ms = (time.perf_counter() - t0) * 1000

    summary_envelope = (out.get("raw") or {}).get("summary")
    log_step(
        run_id, "context_agent",
        input_summary={"order_id": order_id, "sku": sku},
        output_summary=out.get("case"),
        status=out["status"],
        latency_ms=latency_ms,
        model=summary_envelope.get("model") if summary_envelope else None,
        tokens=_tokens_from_envelope(summary_envelope),
        error=out.get("error"),
    )

    events.append({
        "type": "step_done", "step": "context",
        "status": out["status"], "error": out.get("error"),
        "data": out.get("case"),
    })

    route = "ok" if out["status"] == "ok" else "abort"
    return {
        "context_out": out,
        "route_decision": route,
        "abort_error": out.get("error") if route == "abort" else None,
        "events": events,
    }


def route_after_context(state: PipelineState) -> str:
    return state["route_decision"]   # "ok" | "abort"


# ── Node: Policy ──────────────────────────────────────────────────────────────

async def node_policy(state: PipelineState) -> dict:
    run_id   = state["run_id"]
    order_id = state["order_id"]
    sku      = state["sku"]
    case     = state["context_out"]["case"]

    events: list[dict] = [{"type": "step_start", "step": "policy"}]

    t0 = time.perf_counter()
    try:
        out = await policy_agent.run_policy(state["mcp_client"], case, run_id=run_id)
    except Exception as exc:
        logger.exception("policy_agent raised unexpectedly")
        out = {"result": None, "raw": {}, "status": "failed", "error": str(exc)}
    latency_ms = (time.perf_counter() - t0) * 1000

    reasoning_envelope = (out.get("raw") or {}).get("reasoning")
    log_step(
        run_id, "policy_agent",
        input_summary={"order_id": order_id, "sku": sku, "damage_type": case["damage_type"]},
        output_summary=out.get("result"),
        status=out["status"],
        latency_ms=latency_ms,
        model=reasoning_envelope.get("model") if reasoning_envelope else None,
        tokens=_tokens_from_envelope(reasoning_envelope),
        error=out.get("error"),
    )
    events.append({
        "type": "step_done", "step": "policy",
        "status": out["status"], "error": out.get("error"),
        "data": out.get("result"),
    })

    return {"policy_out": out, "events": events}


# ── Node: Inventory ───────────────────────────────────────────────────────────

async def node_inventory(state: PipelineState) -> dict:
    run_id = state["run_id"]
    sku    = state["sku"]
    case   = state["context_out"]["case"]

    events: list[dict] = [{"type": "step_start", "step": "inventory"}]

    t0 = time.perf_counter()
    try:
        out = await inventory_agent.run_inventory(state["mcp_client"], case)
    except Exception as exc:
        logger.exception("inventory_agent raised unexpectedly")
        out = {"result": None, "raw": {}, "status": "failed", "error": str(exc)}
    latency_ms = (time.perf_counter() - t0) * 1000

    log_step(
        run_id, "inventory_agent",
        input_summary={"customer_username": case["customer_username"],
                       "vendor_username": case["vendor_username"], "sku": sku},
        output_summary=out.get("result"),
        status=out["status"],
        latency_ms=latency_ms, model=None, tokens=None, error=out.get("error"),
    )
    events.append({
        "type": "step_done", "step": "inventory",
        "status": out["status"], "error": out.get("error"),
        "data": out.get("result"),
    })

    return {"inventory_out": out, "events": events}


# ── Node: Reorder ─────────────────────────────────────────────────────────────

async def node_reorder(state: PipelineState) -> dict:
    run_id = state["run_id"]
    sku    = state["sku"]
    case   = state["context_out"]["case"]

    events: list[dict] = [{"type": "step_start", "step": "reorder"}]

    t0 = time.perf_counter()
    try:
        out = await reorder_agent.run_reorder(
            state["mcp_client"], case,
            (state.get("inventory_out") or {}).get("result"),
            run_id=run_id,
        )
    except Exception as exc:
        logger.exception("reorder_agent raised unexpectedly")
        out = {"order": None, "skipped": False, "raw": {}, "status": "failed", "error": str(exc)}
    latency_ms = (time.perf_counter() - t0) * 1000

    note_envelope = (out.get("raw") or {}).get("note")
    log_step(
        run_id, "reorder_agent",
        input_summary={"sku": sku, "damaged_qty": case["damaged_qty"]},
        output_summary=out.get("order"),
        status="skipped" if out.get("skipped") else out["status"],
        latency_ms=latency_ms,
        model=note_envelope.get("model") if note_envelope else None,
        tokens=_tokens_from_envelope(note_envelope),
        error=out.get("error"),
    )

    if out.get("skipped"):
        events.append(_skip_event("reorder", "No units were damaged after reconciliation — no replacement stock needed."))
    else:
        events.append({
            "type": "step_done", "step": "reorder",
            "status": out["status"], "error": out.get("error"),
            "data": out.get("order"),
        })

    return {"reorder_out": out, "events": events}


# ── Node: Claim ───────────────────────────────────────────────────────────────

async def node_claim(state: PipelineState) -> dict:
    run_id   = state["run_id"]
    order_id = state["order_id"]
    sku      = state["sku"]
    case     = state["context_out"]["case"]
    policy   = state.get("policy_out") or {}

    events: list[dict] = [{"type": "step_start", "step": "claim"}]

    t0 = time.perf_counter()
    try:
        out = await claim_agent.run_claim(
            state["mcp_client"], case, policy.get("result"), run_id=run_id
        )
    except Exception as exc:
        logger.exception("claim_agent raised unexpectedly")
        out = {"claim": None, "skipped": False, "raw": {}, "status": "failed", "error": str(exc)}
    latency_ms = (time.perf_counter() - t0) * 1000

    draft_envelope = (out.get("raw") or {}).get("draft")
    _log_summary = (
        {"skipped": True, "reason": out.get("skip_reason")}
        if out.get("skipped") else out.get("claim")
    )
    log_step(
        run_id, "claim_agent",
        input_summary={"order_id": order_id, "sku": sku,
                       "eligible_for_claim": (policy.get("result") or {}).get("eligible_for_claim")},
        output_summary=_log_summary,
        status="skipped" if out.get("skipped") else out["status"],
        latency_ms=latency_ms,
        model=draft_envelope.get("model") if draft_envelope else None,
        tokens=_tokens_from_envelope(draft_envelope),
        error=out.get("error"),
    )

    if out.get("skipped"):
        events.append(_skip_event("claim", out.get("skip_reason") or "Claim skipped."))
    else:
        events.append({
            "type": "step_done", "step": "claim",
            "status": out["status"], "error": out.get("error"),
            "data": out.get("claim"),
        })

    return {"claim_out": out, "events": events}


# ── Node: Governance ──────────────────────────────────────────────────────────

async def node_governance(state: PipelineState) -> dict:
    run_id   = state["run_id"]
    order_id = state["order_id"]
    sku      = state["sku"]
    case     = state["context_out"]["case"]

    events: list[dict] = [{"type": "step_start", "step": "governance"}]

    t0 = time.perf_counter()
    try:
        out = await governance_agent.run_governance(
            state["mcp_client"], case,
            (state.get("policy_out") or {}).get("result"),
            (state.get("inventory_out") or {}).get("result"),
            state.get("reorder_out") or {},
            state.get("claim_out") or {},
            run_id=run_id,
        )
    except Exception as exc:
        logger.exception("governance_agent raised unexpectedly")
        out = {"summary": None, "raw": {}, "status": "failed", "error": str(exc)}
    latency_ms = (time.perf_counter() - t0) * 1000

    narrative_envelope = (out.get("raw") or {}).get("narrative")
    log_step(
        run_id, "governance_agent",
        input_summary={"order_id": order_id, "sku": sku},
        output_summary=out.get("summary"),
        status=out["status"],
        latency_ms=latency_ms,
        model=narrative_envelope.get("model") if narrative_envelope else None,
        tokens=_tokens_from_envelope(narrative_envelope),
        error=out.get("error"),
    )
    events.append({
        "type": "step_done", "step": "governance",
        "status": out["status"], "error": out.get("error"),
        "data": out.get("summary"),
    })

    # Determine overall status and emit run_complete
    policy_ok   = (state.get("policy_out") or {}).get("status") == "ok"
    inventory_ok = (state.get("inventory_out") or {}).get("status") == "ok"
    reorder_out  = state.get("reorder_out") or {}
    reorder_ok   = reorder_out.get("skipped") or reorder_out.get("status") == "ok"
    claim_out    = state.get("claim_out") or {}
    claim_ok     = claim_out.get("skipped") or claim_out.get("status") == "ok"
    governance_ok = out["status"] == "ok"

    if all([policy_ok, inventory_ok, reorder_ok, claim_ok, governance_ok]):
        overall = "completed"
    else:
        overall = "partial"

    claim_id = (claim_out.get("claim") or {}).get("id")
    alert_id = ((out.get("summary") or {}).get("inventory_alert_id"))

    from app.logging_store import finish_run
    finish_run(run_id, overall, claim_id=claim_id, alert_id=alert_id)
    observability.flush()

    events.append({"type": "run_complete", "run_id": run_id, "status": overall})

    return {"governance_out": out, "events": events}


# ── Build graph ───────────────────────────────────────────────────────────────

def build_pipeline_graph():
    g = StateGraph(PipelineState)

    g.add_node("inspector",   node_inspector)
    g.add_node("fetch_order", node_fetch_order)
    g.add_node("skip_all",    node_skip_all)
    g.add_node("abort",       node_abort)
    g.add_node("context",     node_context)
    g.add_node("policy",      node_policy)
    g.add_node("inventory",   node_inventory)
    g.add_node("reorder",     node_reorder)
    g.add_node("claim",       node_claim)
    g.add_node("governance",  node_governance)

    # Entry point
    g.set_entry_point("inspector")

    # Inspector → conditional branch
    g.add_conditional_edges(
        "inspector",
        route_after_inspector,
        {"ok": "fetch_order", "no_damage": "skip_all", "abort": "abort"},
    )

    # fetch_order → conditional branch
    g.add_conditional_edges(
        "fetch_order",
        route_after_fetch_order,
        {"ok": "context", "abort": "abort", "po_mismatch": "abort"},
    )

    # Terminal nodes → END
    g.add_edge("skip_all",   END)
    g.add_edge("abort",      END)

    # context → conditional branch
    g.add_conditional_edges(
        "context",
        route_after_context,
        {"ok": "policy", "abort": "abort"},
    )

    # Linear tail
    g.add_edge("policy",     "inventory")
    g.add_edge("inventory",  "reorder")
    g.add_edge("reorder",    "claim")
    g.add_edge("claim",      "governance")
    g.add_edge("governance", END)

    return g.compile()


# Singleton compiled graph
pipeline_graph = build_pipeline_graph()
