"""
Policy Agent — asks the ERP's own SLA RAG (ask_vendor_sla MCP tool, backed
by erp-app/backend/app/rag/sla_rag.py: Gemini embeddings + Groq answer over
the actual SLA document the vendor shared with this customer) whether this
case is eligible for a claim and/or who's liable, then runs a Groq
reasoning pass over that answer + the case facts to produce a structured
verdict.

IMPORTANT: "claim eligibility" and "liability" are kept as two independent
judgments, not "eligible only if liable". Some SLAs are written as a
liability/fault framework (covered vs. excluded damage types, liability
caps); others — like a "Claims SLA – Eligibility for Suspected Transit
Damage" — are written as a procedural evidentiary threshold for whether a
claim should even proceed to review, with fault/liability determined later
by a separate process. Hard-wiring eligible_for_claim = liable would make
the second kind of SLA always look like a denial, which is wrong: the SLA
itself may explicitly say "proceed to claim review" without yet
determining fault. Each is judged from what the SLA answer actually says.
"""
from __future__ import annotations

import logging

from app import observability
from app.agents.confidence import clamp_confidence
from app.agents.json_utils import safe_json_parse
from app.mcp_client import ErpMcpClient, McpClientError
from app.providers import groq_client

logger = logging.getLogger("ai_app.agents.policy")

REASONING_SYSTEM_PROMPT = (
    "You are a freight claims analyst. Given an SLA excerpt-grounded answer and a damage case "
    "description, make three INDEPENDENT judgments — do not assume one implies the other:\n"
    "1. eligible_for_claim: should this case proceed to/be accepted for claim review, per "
    "whatever criteria the SLA actually uses? Some SLAs grant eligibility as a procedural "
    "evidentiary threshold (e.g. 'visible external damage creates a reasonable possibility of "
    "content damage, proceed to review') WITHOUT yet deciding fault — if the SLA's answer "
    "describes exactly this kind of criteria being met, eligible_for_claim is true even if "
    "liability/fault hasn't been determined yet.\n"
    "2. liable: the carrier/vendor's fault determination, ONLY if the SLA answer actually makes "
    "one. Use true/false/\"partial\" if it does. If the SLA defers fault to a later "
    "investigation (as eligibility-threshold SLAs often do) or simply doesn't address fault at "
    "all, use \"pending\" rather than guessing false.\n"
    "3. claim_percentage: the percentage of the total damaged-item value that the customer is "
    "entitled to claim, as stated EXPLICITLY in the SLA (e.g. '80%', '75% of invoice value', "
    "'50% liability cap'). Read the SLA answer carefully for any percentage, fraction, or "
    "monetary cap expressed as a share of item value. If the SLA specifies a cap, convert it to "
    "an integer percentage (e.g. '3/4 of value' → 75). If the SLA does NOT mention any "
    "percentage, cap, or partial liability limit for this damage type, output 100. Never guess "
    "or infer a percentage that isn't explicitly stated — default to 100 when uncertain.\n"
    "Judge by damage cause/category and the evidentiary criteria described — never by whether "
    "the SLA happens to mention the specific product name or SKU, which it generally won't. "
    "Respond with ONLY a JSON object with these exact keys: eligible_for_claim (boolean), liable "
    "(one of: true, false, \"partial\", \"pending\"), justification (string, cite the SLA "
    "answer including any percentage/cap clause verbatim), claim_percentage (integer 1-100), "
    "confidence (integer 0-100 — your own confidence in these judgments, given how "
    "directly the SLA excerpt addresses this exact situation; lower it if the SLA answer is "
    "vague, only tangentially related, or you had to infer rather than read it directly). No "
    "prose, no markdown fences."
)


async def run_policy(mcp_client: ErpMcpClient, case: dict, run_id: str | None = None) -> dict:
    """case is the Context Structuring Agent's output. run_id (optional): forwarded to the
    erp-app SLA RAG call over MCP so it nests under this SAME Langfuse trace despite running
    in a different process — see app/observability.py.
    Returns {result: dict|None, raw: dict, status: 'ok'|'failed', error: str|None}."""
    raw: dict = {"sla_rag": None, "reasoning": None}

    vendor_username = case.get("vendor_username") or ""
    customer_username = case.get("customer_username") or ""
    # Includes the actual evidence/confidence notes (not just the damage category) because some
    # SLAs are written as an evidentiary-threshold test over exactly this kind of inspection
    # note, not as a liability/exclusions table — asking only about "liability and exclusions"
    # would miss that framing entirely (confirmed: it caused a real false-decline).
    question = (
        f"A shipment has {case['damage_type']} damage, {case['damaged_qty']} unit(s) affected. "
        f"Evidence notes: {case['evidence_notes'] or '(none provided)'}. "
        f"Confidence notes: {case['confidence_notes'] or '(none provided)'}. "
        "Per this SLA's criteria, is this case eligible for a damage claim review? Separately, "
        "what does the SLA say (if anything) about liability, exclusions, or liability caps for "
        "this type of damage? Also quote verbatim any clause that specifies what percentage or "
        "fraction of the damaged item's value the customer is entitled to claim (e.g. '80% of "
        "invoice value', '75% liability', 'up to 50% of damaged goods value'). If no such "
        "percentage or cap is mentioned, state that explicitly."
    )

    if not vendor_username:
        sla_answer = {"answer": None, "sources": [], "error": "No vendor linked to this order — SLA check skipped."}
    else:
        try:
            sla_answer = await mcp_client.ask_vendor_sla(vendor_username, customer_username, question, run_id=run_id)
        except McpClientError as exc:
            return {"result": None, "raw": raw, "status": "failed", "error": f"SLA RAG call failed: {exc}"}

    raw["sla_rag"] = sla_answer
    if sla_answer.get("error") or not sla_answer.get("answer"):
        # No SLA on file / RAG failure — fail closed (not eligible) rather than guessing.
        result = {
            "eligible_for_claim": False,
            "liable": "pending",
            "justification": sla_answer.get("error") or "No SLA answer was returned for this vendor/customer pair.",
            "confidence": 0,  # genuinely no basis for this fail-closed guess, not a real judgment
        }
        return {"result": result, "raw": raw, "status": "ok", "error": None}

    reasoning_prompt = (
        f"Damage cause: {case['damage_type']}, {case['damaged_qty']} of {case['ordered_qty']} units affected.\n"
        f"Evidence notes: {case['evidence_notes'] or '(none)'}\n"
        f"Confidence notes: {case['confidence_notes'] or '(none)'}\n\n"
        f"SLA-grounded answer:\n{sla_answer['answer']}\n\n"
        "Make the two independent judgments per the instructions."
    )
    trace_id = observability.trace_id_for(run_id) if run_id else None
    reasoning_result = groq_client.reasoning_chat(
        REASONING_SYSTEM_PROMPT, reasoning_prompt, temperature=0, trace_id=trace_id, name="policy_reasoning"
    )
    raw["reasoning"] = reasoning_result

    if reasoning_result["status"] != "ok":
        return {
            "result": None,
            "raw": raw,
            "status": "failed",
            "error": f"Reasoning call failed: {reasoning_result.get('error')}",
        }

    parsed = safe_json_parse(reasoning_result["content"])
    if parsed is None:
        return {
            "result": None,
            "raw": raw,
            "status": "failed",
            "error": f"Could not parse verdict JSON from model output: {reasoning_result['content']!r}",
        }

    parsed["confidence"] = clamp_confidence(parsed.get("confidence"))
    # Ensure claim_percentage is a valid integer in [1, 100]; default 100 if absent/invalid.
    try:
        pct = int(parsed.get("claim_percentage", 100))
        parsed["claim_percentage"] = max(1, min(100, pct))
    except (TypeError, ValueError):
        parsed["claim_percentage"] = 100
    return {"result": parsed, "raw": raw, "status": "ok", "error": None}
