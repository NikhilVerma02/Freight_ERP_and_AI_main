"""
GET /api/observability/api-logs — admin-only view of the local API-call log
(see app/middleware.py). Mirrors the existing search_audit_logs pattern.

GET /api/observability/rag-eval[, /{run_id}] — RAG quality scorecards
produced by scripts/eval_rag.py (see data/rag_eval_results/*.json). Open to
every authenticated role: these are aggregate quality metrics over a fixed
synthetic test set, not customer/vendor data, so there's nothing sensitive
to restrict — vendors and customers benefit from seeing how reliable the
SLA Q&A they depend on actually is.
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_current_user, require_role
from app.middleware import list_api_logs
from app.rag_eval_runner import get_status, start_run
from app.store import DATA_DIR

router = APIRouter(prefix="/api/observability", tags=["observability"])

RAG_EVAL_DIR = DATA_DIR / "rag_eval_results"


@router.get("/api-logs")
def get_api_logs(limit: int = Query(default=100, le=500), current_user: dict = Depends(require_role("admin", "warehouse"))):
    return list_api_logs(limit=limit)


@router.post("/rag-eval/run")
def trigger_rag_eval_run(current_user: dict = Depends(require_role("admin", "warehouse"))):
    """Kicks off scripts/eval_rag.py in the background. Admin-only since it
    burns real Groq/Gemini quota and takes a few minutes."""
    started, error = start_run()
    if not started:
        raise HTTPException(status_code=409, detail=error)
    return {"started": True}


@router.get("/rag-eval/run/status")
def get_rag_eval_run_status(current_user: dict = Depends(get_current_user)):
    return get_status()


@router.get("/rag-eval")
def list_rag_eval_runs(current_user: dict = Depends(get_current_user)):
    """Most recent first: [{run_id, averages, question_count}, ...]."""
    if not RAG_EVAL_DIR.exists():
        return []
    results = []
    for path in sorted(RAG_EVAL_DIR.glob("*.json"), reverse=True):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        results.append(
            {
                "run_id": path.stem,
                "averages": data.get("averages", {}),
                "question_count": len(data.get("rows", [])),
            }
        )
    return results


@router.get("/rag-eval/{run_id}")
def get_rag_eval_run(run_id: str, current_user: dict = Depends(get_current_user)):
    """Full per-question breakdown for one eval run."""
    path = RAG_EVAL_DIR / f"{Path(run_id).name}.json"  # Path(...).name strips any path traversal
    if not path.exists():
        raise HTTPException(status_code=404, detail="Eval run not found")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        raise HTTPException(status_code=500, detail="Eval run file is corrupted")
    return {"run_id": run_id, **data}
