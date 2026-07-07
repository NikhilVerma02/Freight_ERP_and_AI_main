"""
Pipeline orchestrator — powered by LangGraph.

run_pipeline_stream() is the public API consumed by the FastAPI router (routers/ingest.py).
It keeps the identical interface and SSE event protocol as before, but now drives execution
through a LangGraph StateGraph defined in pipeline_graph.py.

Graph topology (see pipeline_graph.py for the full docstring):
  inspector → [no_damage → skip_all | failed → abort | ok → fetch_order]
  fetch_order → [po_mismatch → abort | abort | ok → context]
  context → [failed → abort | ok → policy → inventory → reorder → claim → governance]
  skip_all / abort / governance → END

stream_mode="updates" means each LangGraph iteration yields:
  { "node_name": <state patch from that node> }

Each node appends step_start / step_done events to state["events"] (accumulated via
operator.add).  We drain those events from each update and re-yield them as SSE dicts.
The final "run_complete" event is always emitted by the terminal node (skip_all, abort,
or governance), so the router receives a complete stream without any extra logic here.
"""
from __future__ import annotations

import logging
from typing import Any, AsyncIterator

from app import observability
from app.agents.pipeline_graph import PipelineState, pipeline_graph
from app.logging_store import create_run, new_run_id
from app.mcp_client import ErpMcpClient

logger = logging.getLogger("ai_app.agents.orchestrator")


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
    """Async generator — yields SSE event dicts consumed by routers/ingest.py.

    Event types:
      {"type": "step_start",    "step": <name>}
      {"type": "step_done",     "step": <name>, "status", "error", "data"}
      {"type": "run_complete",  "run_id": ...,  "status": "completed"|"partial"|"failed"|"po_mismatch",
                                "error": ... (po_mismatch only)}
    """
    run_id = new_run_id()
    case_summary = (
        manual_transcript or (f"{len(files)} media file(s) uploaded" if files else "no input")
    )[:200]
    create_run(run_id, case_summary, actor_username=actor_username, actor_role=actor_role)

    observability.start_trace(
        observability.trace_id_for(run_id) or run_id,
        "claims_pipeline",
        metadata={"actor_username": actor_username, "actor_role": actor_role,
                  "order_id": order_id, "sku": sku},
        input={"case_summary": case_summary},
    )

    initial_state: PipelineState = {
        # fixed inputs
        "run_id": run_id,
        "order_id": order_id,
        "sku": sku,
        "files": files,
        "manual_transcript": manual_transcript,
        "actor_username": actor_username,
        "actor_role": actor_role,
        "hint_vendor_username": hint_vendor_username,
        "hint_customer_username": hint_customer_username,
        "mcp_client": mcp_client,
        # per-agent outputs (all None at start)
        "inspector_out": None,
        "order": None,
        "order_error": None,
        "context_out": None,
        "policy_out": None,
        "inventory_out": None,
        "reorder_out": None,
        "claim_out": None,
        "governance_out": None,
        # routing / control
        "route_decision": "",
        "abort_error": None,
        # accumulated SSE events — starts empty; nodes append via operator.add
        "events": [],
    }

    # stream_mode="updates" → each iteration is {node_name: {fields changed by that node}}
    async for node_update in pipeline_graph.astream(initial_state, stream_mode="updates"):
        for _node_name, patch in node_update.items():
            # Every node appends its events to state["events"].
            # In "updates" mode the patch contains only the delta — new events only.
            for event in patch.get("events", []):
                yield event
