from __future__ import annotations

import json
import time

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, File
from pydantic import BaseModel

from app.auth import get_current_user, require_role
from app.rag import sla_rag
from app.services import claims as claims_svc
from app.services import links as links_svc
from app.services import orders as orders_svc
from app.services import sla as sla_svc
from app.services import users as users_svc

router = APIRouter(prefix="/api/vendors", tags=["vendors"])


class AskSlaRequest(BaseModel):
    question: str


@router.get("/sla")
def list_sla(current_user: dict = Depends(get_current_user)):
    return sla_svc.list_slas_for(current_user)


@router.post("/sla/upload")
async def upload_sla(
    file: UploadFile = File(...),
    vendor_username: str = Form(...),
    customer_usernames: str = Form(default="[]"),
    current_user: dict = Depends(require_role("admin", "vendor_order_manager", "procurement_officer")),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    if current_user["role"] == "vendor_order_manager":
        vendor_username = current_user["username"]

    if current_user["role"] == "procurement_officer":
        # Procurement officers upload SLAs on behalf of vendors — no customer linking required
        requested_customers = []
    else:
        try:
            requested_customers = json.loads(customer_usernames)
            if not isinstance(requested_customers, list) or not all(isinstance(c, str) for c in requested_customers):
                raise ValueError
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="customer_usernames must be a JSON array of usernames")

        linked_customers = set(links_svc.customers_for_vendor(vendor_username))
        if not requested_customers:
            requested_customers = list(linked_customers)

        invalid = [c for c in requested_customers if c not in linked_customers]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Not linked to customer(s): {', '.join(invalid)}")

    sla_svc.SLA_DIR.mkdir(parents=True, exist_ok=True)
    vendor_user = users_svc.get_user_by_username(vendor_username, safe=True)
    company_name = (vendor_user or {}).get("company_name") or vendor_username
    safe_company = "".join(c if c.isalnum() or c in (" ", "-", "_") else "" for c in company_name).strip().replace(" ", "_")
    dest_filename = f"{safe_company}_{int(time.time() * 1000)}.pdf"
    dest_path = sla_svc.SLA_DIR / dest_filename

    contents = await file.read()
    with open(dest_path, "wb") as f:
        f.write(contents)

    text = sla_svc.extract_pdf_text(dest_path)
    # Naive liability summary: first ~300 chars of extracted text as a placeholder summary.
    liability_summary = (text.strip()[:300] + "...") if len(text.strip()) > 300 else text.strip()

    return sla_svc.upsert_sla(
        vendor_username=vendor_username,
        filename=dest_filename,
        text=text,
        liability_summary=liability_summary,
        customer_usernames=requested_customers,
        actor=vendor_username,
    )


@router.delete("/sla/{sla_id}")
def delete_sla(sla_id: int, current_user: dict = Depends(require_role("admin", "vendor_order_manager", "procurement_officer"))):
    record = sla_svc.get_sla_by_id(sla_id)
    if not record:
        raise HTTPException(status_code=404, detail="No SLA document on file")
    if current_user["role"] == "vendor_order_manager" and record.get("vendor_username") != current_user["username"]:
        raise HTTPException(status_code=403, detail="Not permitted")
    sla_svc.delete_sla(sla_id, actor=current_user["username"])
    return {"deleted": True}


@router.post("/sla/{sla_id}/ask")
def ask_sla(sla_id: int, payload: AskSlaRequest, current_user: dict = Depends(get_current_user)):
    record = sla_svc.get_sla_by_id(sla_id)
    if not record:
        raise HTTPException(status_code=404, detail="No SLA document on file")
    if not sla_svc.can_access_sla(record, current_user):
        raise HTTPException(status_code=403, detail="Not permitted")
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Question is required")

    result = sla_rag.ask_sla(sla_id, payload.question.strip())
    if result["error"]:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@router.get("/linked")
def linked_vendors_for_customer(current_user: dict = Depends(require_role("customer"))):
    """Return vendors linked to this customer — used by Customer Portal to populate order form."""
    vendor_usernames = links_svc.vendors_for_customer(current_user["username"])
    results = []
    for vname in vendor_usernames:
        user = users_svc.get_user_by_username(vname, safe=True)
        results.append({
            "username": vname,
            "display_name": (user or {}).get("display_name", vname),
        })
    return results


@router.get("/{vendor_username}/customers")
def my_customers(vendor_username: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "vendor_order_manager" and current_user["username"] != vendor_username:
        raise HTTPException(status_code=403, detail="Not permitted")
    if current_user["role"] not in ("vendor_order_manager", "admin", "procurement_officer", "finance_officer"):
        raise HTTPException(status_code=403, detail="Not permitted")

    customer_usernames = links_svc.customers_for_vendor(vendor_username)
    all_orders = orders_svc.list_orders()
    all_claims = claims_svc.list_claims()

    results = []
    for username in customer_usernames:
        user = users_svc.get_user_by_username(username, safe=True)
        order_count = sum(1 for o in all_orders if o.get("customer_username") == username and o.get("vendor_username") == vendor_username)
        claim_count = sum(1 for c in all_claims if c.get("customer_username") == username and c.get("vendor_username") == vendor_username)
        results.append(
            {
                "username": username,
                "display_name": (user or {}).get("display_name", username),
                "company_name": (user or {}).get("company_name"),
                "order_count": order_count,
                "claim_count": claim_count,
            }
        )
    return results
