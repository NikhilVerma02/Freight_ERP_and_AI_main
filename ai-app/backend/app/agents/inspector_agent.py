"""
Inspector Agent — multimodal evidence understanding, via Gemini.

Accepts whatever combination of video/image/audio files and/or a manual
transcript the customer provided and asks Gemini, in a single multimodal
call, to extract structured damage-claim facts. order_id/sku/vendor are
already known from the upload form picker — that picker selection remains
the ground truth used by every downstream agent. The PO/order number is
still extracted here too (if mentioned/visible in the evidence) purely as
a cross-check: the Context Structuring Agent flags a mismatch if the
customer's spoken/written order number doesn't match the order they
actually picked, so a wrong-order upload gets caught instead of silently
filing a claim against the wrong order.
"""
from __future__ import annotations

import logging

from app import observability
from app.agents.confidence import clamp_confidence
from app.agents.json_utils import safe_json_parse
from app.providers import gemini_client

logger = logging.getLogger("ai_app.agents.inspector")

EXTRACTION_SYSTEM_PROMPT = (
    "You are a freight damage inspector. Given video/photo/audio evidence and/or a written "
    "description of damaged freight, extract structured case facts. If the evidence is a video "
    "or audio recording, LISTEN to its full audio track carefully — the person filming or "
    "recording often narrates out loud while showing the damage (e.g. stating the PO/order "
    "number, what happened, how many units are affected) and that spoken narration is just as "
    "important a source of facts as what's visible on screen. Respond with ONLY a JSON object "
    "with these exact keys: po_number (string or null — a PO/order number ONLY if one is "
    "explicitly spoken or visible in the evidence, e.g. 'PO 5543' or 'ORD-0001'; null if none is "
    "mentioned), damage_type (string, e.g. 'moisture/water damage', 'crushing', 'impact', "
    "'shortage', 'other'), damaged_qty (integer or null — count ONLY the units that are visibly "
    "damaged or explicitly stated as damaged by the narrator; DO NOT count the total number of "
    "units in the shipment or on shelves; if only 1 item is shown as damaged, return 1), "
    "evidence_notes (short string describing what you observed AND what was said), "
    "confidence_notes (short string explaining any uncertainty), confidence (integer 0-100 — "
    "your own confidence that the extracted facts above are accurate and complete, given the "
    "clarity/completeness of the evidence; lower it for blurry footage, inaudible narration, or "
    "any guesswork). No prose, no markdown fences."
)


async def run_inspection(files: list[dict], manual_transcript: str | None, run_id: str | None = None) -> dict:
    """files: list of {"data": bytes, "mime_type": str} (video/image/audio, any combination).
    run_id (optional): threaded down for Langfuse tracing — see app/observability.py.
    Returns {extracted: dict|None, raw: dict, status: 'ok'|'failed', error: str|None}."""
    raw: dict = {"extract": None}

    has_transcript = bool(manual_transcript and manual_transcript.strip())
    if not files and not has_transcript:
        return {
            "extracted": None,
            "raw": raw,
            "status": "failed",
            "error": "No media files or manual_transcript provided.",
        }

    user_text = manual_transcript.strip() if has_transcript else ""
    if files:
        user_text = (user_text + "\n\n" if user_text else "") + "Examine the attached evidence of freight damage."

    trace_id = observability.trace_id_for(run_id) if run_id else None
    extract_result = gemini_client.multimodal_extract(EXTRACTION_SYSTEM_PROMPT, user_text, files, trace_id=trace_id)
    raw["extract"] = extract_result

    if extract_result["status"] != "ok":
        return {
            "extracted": None,
            "raw": raw,
            "status": "failed",
            "error": f"Extraction failed: {extract_result.get('error')}",
        }

    extracted = safe_json_parse(extract_result["content"])
    if extracted is None:
        return {
            "extracted": None,
            "raw": raw,
            "status": "failed",
            "error": f"Could not parse structured JSON from model output: {extract_result['content']!r}",
        }
    extracted["confidence"] = clamp_confidence(extracted.get("confidence"))

    return {"extracted": extracted, "raw": raw, "status": "ok", "error": None}
