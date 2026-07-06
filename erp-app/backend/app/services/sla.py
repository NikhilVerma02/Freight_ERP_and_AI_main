"""Vendor SLA documents — one record per upload, targeted at selected customers."""
from __future__ import annotations

from pathlib import Path

from pypdf import PdfReader

from app.store import Collection, now_iso
from app.rag import sla_rag
from app.services import links as links_svc
from app.services.audit_logs import log_action
from app.store import DATA_DIR

SLA_DIR = DATA_DIR / "sla_documents"

_col = Collection("vendor_sla.json")


def extract_pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    return "\n\n".join(page.extract_text() or "" for page in reader.pages)


def list_slas() -> list[dict]:
    return sorted(_col.list_all(), key=lambda r: r.get("id", 0))


def get_sla_by_id(sla_id: int) -> dict | None:
    return _col.get(sla_id)


def list_slas_for_vendor(vendor_username: str) -> list[dict]:
    return [s for s in _col.list_all() if s.get("vendor_username") == vendor_username]


def _enrich_with_company_name(records: list[dict]) -> list[dict]:
    from app.services import users as users_svc
    out = []
    for r in records:
        rec = dict(r)
        vu = r.get("vendor_username", "")
        if vu:
            u = users_svc.get_user_by_username(vu, safe=True) or {}
            rec["vendor_company_name"] = u.get("company_name") or u.get("display_name") or vu
        out.append(rec)
    return out


def list_slas_for(current_user: dict) -> list[dict]:
    role = current_user.get("role")
    username = current_user.get("username")
    if role in ("admin", "procurement_officer", "inventory_controller", "finance_officer"):
        return _enrich_with_company_name(list_slas())
    if role in ("vendor_order_manager", "vendor_claim_handler"):
        return _enrich_with_company_name(list_slas_for_vendor(username))
    if role == "customer":
        linked_vendors = set(links_svc.vendors_for_customer(username))
        return _enrich_with_company_name([s for s in list_slas() if s.get("vendor_username") in linked_vendors])
    return []


def can_access_sla(sla: dict, current_user: dict) -> bool:
    role = current_user.get("role")
    username = current_user.get("username")
    if role in ("admin", "procurement_officer", "inventory_controller", "finance_officer"):
        return True
    if role in ("vendor_order_manager", "vendor_claim_handler"):
        return sla.get("vendor_username") == username
    if role == "customer":
        return links_svc.is_linked(username, sla.get("vendor_username"))
    return False


def upsert_sla(
    vendor_username: str,
    filename: str,
    text: str,
    liability_summary: str,
    customer_usernames: list[str],
    actor: str = "system",
) -> dict:
    record = _col.create({
        "vendor_username": vendor_username,
        "customer_usernames": customer_usernames,
        "sla_document_filename": filename,
        "sla_text_cache": text,
        "liability_summary": liability_summary,
        "uploaded_at": now_iso(),
    })
    log_action(
        actor,
        "upsert",
        "vendor_sla",
        record["id"],
        f"SLA uploaded for {vendor_username} -> {customer_usernames} ({filename})",
    )
    index_status = sla_rag.index_sla(record["id"], vendor_username, text)
    if not index_status["indexed"]:
        log_action(actor, "rag_index_failed", "vendor_sla", record["id"],
                   index_status.get("error") or "unknown error")
    return record


def get_sla_text(sla_id: int) -> str | None:
    record = get_sla_by_id(sla_id)
    return record.get("sla_text_cache") if record else None


def delete_sla(sla_id: int, actor: str = "system") -> bool:
    record = get_sla_by_id(sla_id)
    if not record:
        return False
    filename = record.get("sla_document_filename")
    if filename:
        path = SLA_DIR / filename
        if path.exists():
            path.unlink()
    ok = _col.delete(sla_id)
    if ok:
        sla_rag.delete_sla_index(sla_id)
        log_action(actor, "delete", "vendor_sla", sla_id,
                   f"SLA deleted for {record.get('vendor_username')}")
    return ok
