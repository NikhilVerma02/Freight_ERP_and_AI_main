"""Bidirectional, scoped alerts for orders/claims events."""
from __future__ import annotations

from app.store import Collection, now_iso
from app.services.audit_logs import log_action

_col = Collection("alerts.json")


def list_alerts() -> list[dict]:
    return sorted(_col.list_all(), key=lambda r: r.get("created_at", ""), reverse=True)


def list_alerts_for(current_user: dict) -> list[dict]:
    role = current_user.get("role")
    username = current_user.get("username")
    all_alerts = list_alerts()
    if role in ("admin", "warehouse", "procurement_officer", "inventory_controller", "finance_officer"):
        return all_alerts
    return [a for a in all_alerts if a.get("target_username") == username]


def get_alert(alert_id: int) -> dict | None:
    return _col.get(alert_id)


def create_alert(
    audience: str,
    target_username: str | None,
    type_: str,
    title: str,
    message: str,
    related_id: int | None = None,
    actor: str = "system",
) -> dict:
    record = _col.create({
        "audience": audience,
        "target_username": target_username,
        "type": type_,
        "title": title,
        "message": message,
        "related_id": related_id,
        "status": "unread",
    })
    log_action(actor, "create", "alerts", record["id"], f"alert to {target_username or audience}: {title}")
    return record


def mark_read(alert_id: int, current_user: dict, actor: str = "system") -> dict | None:
    alert = get_alert(alert_id)
    if not alert:
        return None
    if current_user.get("role") not in ("admin", "procurement_officer", "inventory_controller", "finance_officer") \
            and alert.get("target_username") != current_user.get("username"):
        return None
    record = _col.update(alert_id, {"status": "read"})
    if not record:
        return None
    log_action(actor, "update", "alerts", alert_id, "marked read")
    return record


def delete_alert(alert_id: int, actor: str = "system") -> bool:
    ok = _col.delete(alert_id)
    if ok:
        log_action(actor, "delete", "alerts", alert_id, "deleted alert")
    return ok
