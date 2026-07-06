from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.services import alerts as svc

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("")
def list_alerts(current_user: dict = Depends(get_current_user)):
    return svc.list_alerts_for(current_user)


@router.get("/{alert_id}")
def get_alert(alert_id: int, current_user: dict = Depends(get_current_user)):
    alert = svc.get_alert(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if current_user["role"] not in ("admin", "warehouse", "procurement_officer", "inventory_controller", "finance_officer") and alert.get("target_username") != current_user["username"]:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.put("/{alert_id}/read")
def mark_read(alert_id: int, current_user: dict = Depends(get_current_user)):
    record = svc.mark_read(alert_id, current_user, actor=current_user["username"])
    if not record:
        raise HTTPException(status_code=404, detail="Alert not found")
    return record


@router.delete("/{alert_id}")
def delete_alert(alert_id: int, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ("admin", "warehouse", "procurement_officer", "inventory_controller", "finance_officer"):
        raise HTTPException(status_code=403, detail="Not permitted")
    ok = svc.delete_alert(alert_id, actor=current_user["username"])
    if not ok:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"status": "deleted"}
