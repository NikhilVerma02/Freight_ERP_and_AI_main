from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_current_user
from app.services import audit_logs as svc

router = APIRouter(prefix="/api/audit_logs", tags=["audit_logs"])


@router.get("")
def list_logs(
    query: str | None = Query(default=None),
    limit: int = Query(default=200),
    current_user: dict = Depends(get_current_user),
):
    if query:
        return svc.search_audit_logs(query, limit)
    logs = svc.list_audit_logs()
    return sorted(logs, key=lambda l: l.get("timestamp", ""), reverse=True)[:limit]


@router.get("/{log_id}")
def get_log(log_id: int, current_user: dict = Depends(get_current_user)):
    log = svc.get_audit_log(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Audit log not found")
    return log
