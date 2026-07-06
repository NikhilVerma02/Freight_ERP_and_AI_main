"""GET /api/logs[?status=failed] — Exceptions/Logs view backing data."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.auth import require_role
from app.logging_store import list_logs

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("")
async def get_logs(status: str | None = Query(default=None), current_user: dict = Depends(require_role("admin"))):
    return list_logs(status=status)
