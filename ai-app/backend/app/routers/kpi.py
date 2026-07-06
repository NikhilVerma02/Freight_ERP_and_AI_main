"""GET /api/kpi/summary — aggregated KPI numbers for the dashboard."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import require_role
from app.logging_store import kpi_summary

router = APIRouter(prefix="/api/kpi", tags=["kpi"])


@router.get("/summary")
async def get_kpi_summary(current_user: dict = Depends(require_role("admin", "inspector"))):
    return kpi_summary()
