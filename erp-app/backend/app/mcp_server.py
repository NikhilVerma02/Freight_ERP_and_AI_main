"""
MCP server exposing ERP tools over streamable-HTTP, mounted at /mcp on the
same FastAPI app (port 8001). Every tool calls the SAME service-layer
function used by the REST routers — no duplicated business logic.

This tool set backs the ai-app's customer-facing claims pipeline (Inspector
-> Context -> Policy -> Inventory -> Reorder -> Claim -> Governance agents):
the ERP is the single source of truth for orders/inventory/claims/SLA text,
and ai-app only ever reads/writes it through these typed tools.

NOTE on fastmcp API surface: this targets fastmcp 2.x, where `FastMCP` is
instantiated directly (no separate "low-level server" wrapper needed) and
`mcp.http_app()` returns a Starlette/ASGI app suitable for mounting via
`app.mount("/mcp", mcp_asgi_app)` on a FastAPI instance.
"""
from __future__ import annotations

from fastmcp import FastMCP

from app import observability
from app.rag import sla_rag
from app.services import alerts as alerts_svc
from app.services import audit_logs as audit_svc
from app.services import claims as claims_svc
from app.services import customer_inventory as cust_inv_svc
from app.services import links as links_svc
from app.services import orders as orders_svc
from app.services import purchase_orders as po_svc
from app.services import sla as sla_svc
from app.services import users as users_svc
from app.services import vendor_inventory as vendor_inv_svc

mcp = FastMCP("freight-erp")


# ---------------------------------------------------------------------------
# Vendor/customer/order lookups (used to populate the AI portal's pickers
# and to ground the agent pipeline in real ERP state).
# ---------------------------------------------------------------------------

@mcp.tool()
def list_vendors_for_customer(customer_username: str) -> list[dict]:
    """List vendors linked to a customer: [{username, display_name, company_name}]."""
    results = []
    for vendor_username in links_svc.vendors_for_customer(customer_username):
        user = users_svc.get_user_by_username(vendor_username, safe=True)
        results.append(
            {
                "username": vendor_username,
                "display_name": (user or {}).get("display_name", vendor_username),
                "company_name": (user or {}).get("company_name"),
            }
        )
    return results


@mcp.tool()
def list_customers_for_vendor(vendor_username: str) -> list[dict]:
    """List customers linked to a vendor: [{username, display_name, company_name}]."""
    results = []
    for customer_username in links_svc.customers_for_vendor(vendor_username):
        user = users_svc.get_user_by_username(customer_username, safe=True)
        results.append(
            {
                "username": customer_username,
                "display_name": (user or {}).get("display_name", customer_username),
                "company_name": (user or {}).get("company_name"),
            }
        )
    return results


@mcp.tool()
def list_customer_orders(customer_username: str, vendor_username: str | None = None) -> list[dict]:
    """List a customer's orders, optionally narrowed to one vendor."""
    orders = [o for o in orders_svc.list_orders() if o.get("customer_username") == customer_username]
    if vendor_username:
        orders = [o for o in orders if o.get("vendor_username") == vendor_username]
    return orders


@mcp.tool()
def list_vendor_orders(vendor_username: str) -> list[dict]:
    """List all orders placed with a vendor (across all of that vendor's customers)."""
    return [o for o in orders_svc.list_orders() if o.get("vendor_username") == vendor_username]


@mcp.tool()
def get_order_by_id(order_id: int) -> dict | None:
    """Fetch an order by its internal id."""
    return orders_svc.get_order(order_id)


@mcp.tool()
def get_purchase_order_by_id(po_id: int) -> dict | None:
    """Fetch a purchase order by its internal id."""
    return po_svc.get_purchase_order(po_id)


@mcp.tool()
def list_vendor_purchase_orders(vendor_username: str) -> list[dict]:
    """List all purchase orders for a vendor."""
    return po_svc.list_purchase_orders(vendor_username=vendor_username)


@mcp.tool()
def create_purchase_order(
    vendor_username: str,
    sku: str,
    item_name: str,
    quantity: int,
    created_by: str,
    delivery_date: str | None = None,
    notes: str | None = None,
    source_order_number: str | None = None,
) -> dict:
    """Create a new Purchase Order for a vendor and return the saved record (with auto-assigned PO number).
    created_by: the actor requesting the reorder (e.g. 'ai-agent').
    delivery_date: ISO date string (YYYY-MM-DD), optional.
    source_order_number: the original order/PO that triggered this reorder — stored so duplicates can be detected."""
    from datetime import datetime, timedelta, timezone
    existing = po_svc.list_purchase_orders()
    next_num = len(existing) + 1
    po_number = f"PO-{next_num:04d}"
    now = datetime.now(timezone.utc)
    if not delivery_date:
        delivery_date = (now + timedelta(days=3)).strftime("%Y-%m-%d")
    payload = {
        "po_number": po_number,
        "vendor_username": vendor_username,
        "sku": sku,
        "item_name": item_name,
        "item_code": sku,
        "quantity": quantity,
        "item_quantity": quantity,
        "status": "Pending",
        "created_by": created_by,
        "customer_name": created_by,
        "date_raised": now.isoformat(),
        "delivery_date": delivery_date,
        "total_cost": 0,
        "inventory_added": False,
        "notes": notes,
        "source_order_number": source_order_number,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    return po_svc.create_purchase_order(payload)


@mcp.tool()
def find_reorder_by_source(vendor_username: str, sku: str, source_order_number: str) -> dict | None:
    """Check if an AI-generated reorder PO already exists for a given vendor, SKU, and source order number.
    Returns the existing PO record or None."""
    all_pos = po_svc.list_purchase_orders()
    return next(
        (
            p for p in all_pos
            if p.get("created_by") == "ai-agent"
            and p.get("vendor_username") == vendor_username
            and p.get("sku") == sku
            and p.get("source_order_number") == source_order_number
        ),
        None,
    )


@mcp.tool()
def find_claim_by_po_and_sku(po_number: str, sku: str) -> dict | None:
    """Check if a claim already exists for a given PO number and SKU.
    Returns the existing claim record or None."""
    all_claims = claims_svc.list_claims()
    return next(
        (c for c in all_claims if c.get("order_number") == po_number and c.get("sku") == sku),
        None,
    )


@mcp.tool()
def list_customer_claims(customer_username: str) -> list[dict]:
    """List all claims filed by a customer (across all vendors)."""
    return [c for c in claims_svc.list_claims() if c.get("customer_username") == customer_username]


@mcp.tool()
def list_vendor_claims(vendor_username: str) -> list[dict]:
    """List all claims filed against a vendor (across all of that vendor's customers)."""
    return [c for c in claims_svc.list_claims() if c.get("vendor_username") == vendor_username]


@mcp.tool()
def list_customer_inventory(customer_username: str, vendor_username: str | None = None) -> list[dict]:
    """List a customer's received-stock inventory, optionally narrowed to one vendor."""
    items = cust_inv_svc.list_inventory(customer_username)
    if vendor_username:
        items = [i for i in items if i.get("vendor_username") == vendor_username]
    return items


@mcp.tool()
def list_vendor_inventory(vendor_username: str | None = None) -> list[dict]:
    """List vendor inventory items, optionally filtered to one vendor's stock."""
    return vendor_inv_svc.list_inventory(vendor_username)


@mcp.tool()
def add_vendor_inventory(vendor_username: str, sku: str, item_name: str, qty: int) -> dict:
    """Add (or increment) undamaged units into the vendor's ERP inventory.
    Used by the AI pipeline to book the undamaged portion of a shipment into the ERP."""
    return vendor_inv_svc.add_qty(
        vendor_username=vendor_username,
        sku=sku,
        item_name=item_name,
        qty=qty,
        actor="ai-agent",
    )


@mcp.tool()
def get_purchase_order_by_number(po_number: str) -> dict | None:
    """Fetch a purchase order by its PO number (e.g. 'PO-0001')."""
    all_pos = po_svc.list_purchase_orders()
    return next((p for p in all_pos if p.get("po_number") == po_number), None)


@mcp.tool()
def mark_po_inventory_added(po_number: str) -> dict | None:
    """Mark a purchase order's inventory_added flag as True after undamaged units are booked."""
    all_pos = po_svc.list_purchase_orders()
    po = next((p for p in all_pos if p.get("po_number") == po_number), None)
    if not po:
        return None
    return po_svc.update_purchase_order(po["id"], {"inventory_added": True})


# ---------------------------------------------------------------------------
# SLA RAG (Policy Agent) — delegates to the ERP's own Gemini-embedding +
# Groq-answer RAG pipeline (app/rag/sla_rag.py) over the SLA doc(s) the
# vendor has shared with this specific customer.
# ---------------------------------------------------------------------------

@mcp.tool()
def ask_vendor_sla(vendor_username: str, customer_username: str, question: str, run_id: str | None = None) -> dict:
    """Ask a natural-language question about the SLA a vendor shared with a customer.
    run_id (optional): the calling ai-app pipeline run's id — when given, this call's Langfuse
    trace nests under that SAME run (see app/observability.py: both apps deterministically
    derive the identical trace id from this one shared run_id, no Langfuse-internal id needs
    to cross the MCP wire).
    Returns {answer: str|None, sources: list[str], error: str|None}."""
    all_vendor_slas = [s for s in sla_svc.list_slas() if s.get("vendor_username") == vendor_username]
    if customer_username:
        # Prefer SLAs shared with this specific customer; fall back to vendor-wide SLAs (empty customer list)
        candidates = [s for s in all_vendor_slas if customer_username in (s.get("customer_usernames") or [])]
        if not candidates:
            candidates = [s for s in all_vendor_slas if not (s.get("customer_usernames") or [])]
    else:
        candidates = all_vendor_slas
    if not candidates:
        return {"answer": None, "sources": [], "error": "No SLA has been shared with this customer for this vendor"}
    sla = max(candidates, key=lambda s: s.get("uploaded_at") or "")
    trace_id = observability.trace_id_for(run_id) if run_id else None
    return sla_rag.ask_sla(sla["id"], question, trace_id=trace_id)


# ---------------------------------------------------------------------------
# Mutations — Reorder Agent / Claim Agent / Governance Agent.
# ---------------------------------------------------------------------------

@mcp.tool()
def create_order(customer_username: str, vendor_username: str, items: list[dict]) -> dict:
    """Create a replacement-stock order. items: [{sku, item_name, qty}]. Audit-logged as ai-agent.
    Raises ValueError('not_linked') if the customer/vendor aren't linked."""
    return orders_svc.create_order(customer_username, vendor_username, items, actor="ai-agent")


@mcp.tool()
def create_claim(customer_username: str, order_id: int | None, sku: str, damage_type: str, damaged_qty: int, claim_text: str,
                 vendor_username: str = "", order_number: str = "",
                 claim_value: float | None = None, cost_per_unit: float | None = None,
                 claim_percentage: int = 100, email_draft: str | None = None) -> dict:
    """Create a new claim against a customer's own order. Audit-logged as ai-agent.
    vendor_username and order_number are hints used when the stored order record is missing them.
    claim_value: monetary value of the claim after applying claim_percentage.
    cost_per_unit: unit cost derived from the PO's total_cost / quantity.
    claim_percentage: the SLA-derived entitlement percentage (1-100); 100 means full value.
    email_draft: AI-generated professional claim email addressed to the vendor.
    Raises ValueError('order_not_found') or ValueError('forbidden')."""
    return claims_svc.create_claim(
        customer_username=customer_username,
        order_id=order_id,
        sku=sku,
        damage_type=damage_type,
        damaged_qty=damaged_qty,
        claim_text=claim_text,
        actor="ai-agent",
        vendor_username=vendor_username,
        order_number=order_number,
        claim_value=claim_value,
        cost_per_unit=cost_per_unit,
        claim_percentage=claim_percentage,
        email_draft=email_draft,
    )


@mcp.tool()
def create_alert(audience: str, target_username: str | None, type: str, title: str, message: str, related_id: int | None = None) -> dict:
    """Create a new alert record (status='unread'). audience: admin|vendor|customer. Audit-logged as ai-agent."""
    return alerts_svc.create_alert(
        audience=audience,
        target_username=target_username,
        type_=type,
        title=title,
        message=message,
        related_id=related_id,
        actor="ai-agent",
    )


@mcp.tool()
def get_user_by_username(username: str) -> dict | None:
    """Fetch a user record by username (safe=True: password excluded). Returns None if not found."""
    return users_svc.get_user_by_username(username, safe=True)


@mcp.tool()
def list_users_by_company(vendor_username: str) -> list[dict]:
    """Return all user accounts that share the same company_name as vendor_username.
    Used to fan-out alerts to every person at a vendor company (e.g. Order Manager + Claim Handler).
    Returns [{username, display_name, role, company_name}] — passwords excluded."""
    anchor = users_svc.get_user_by_username(vendor_username, safe=True)
    if not anchor:
        return []
    company = (anchor.get("company_name") or "").strip()
    if not company:
        return [anchor]
    return [
        {k: u[k] for k in ("username", "display_name", "role", "company_name") if k in u}
        for u in users_svc.list_users(safe=True)
        if (u.get("company_name") or "").strip() == company
    ]


@mcp.tool()
def search_audit_logs(query: str | None = None, limit: int = 50) -> list[dict]:
    """Search audit logs by free-text query over action/module/actor/details."""
    return audit_svc.search_audit_logs(query, limit)
