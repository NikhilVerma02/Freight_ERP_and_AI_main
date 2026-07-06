"""
Idempotent seed script: populates data/*.json with realistic demo data for
the admin/vendor/customer RBAC model. SLA documents are intentionally NOT
seeded here — they only exist once a vendor uploads one via the SLA Upload
page, at which point they're chunked/embedded/stored in chromaDB by
app/rag/sla_rag.py. Safe to call on every startup — each file is only
written if missing or empty.
"""
from __future__ import annotations

from pathlib import Path

from app.services import links as links_svc
from app.services.users import hash_password
from app.store import DATA_DIR, now_iso, read_json, write_json


def _is_empty(path: Path) -> bool:
    data = read_json(path)
    if data is None:
        return True
    if isinstance(data, list) and len(data) == 0:
        return True
    return False


def seed_users() -> None:
    path = DATA_DIR / "users.json"
    if not _is_empty(path):
        return
    # Passwords follow the app's password policy (see app/services/users.py:
    # PASSWORD_POLICY_DESCRIPTION) — min 8 chars, upper+lower+digit+special char.
    demo_users = [
        ("admin", "Admin@123", "admin", "Alex Admin", None, "admin@freighterp.com"),
        ("vendorx", "Vendorx@123", "vendor", "Vendor X", "Vendor X Logistics", "ops@vendorx.com"),
        ("vendory", "Vendory@123", "vendor", "Vendor Y", "Vendor Y Freight", "ops@vendory.com"),
        ("vendorz", "Vendorz@123", "vendor", "Vendor Z", "Vendor Z Transport", "ops@vendorz.com"),
        ("customera", "Customera@123", "customer", "Customer A", "Customer A Manufacturing", "procurement@customera.com"),
        ("customerb", "Customerb@123", "customer", "Customer B", "Customer B Industries", "procurement@customerb.com"),
    ]
    ts = now_iso()
    records = []
    for username, password, role, display_name, company_name, email in demo_users:
        records.append(
            {
                "username": username,
                "password_hash": hash_password(password),
                "role": role,
                "display_name": display_name,
                "company_name": company_name,
                "email": email,
                "created_at": ts,
                "updated_at": ts,
            }
        )
    write_json(path, records)


def seed_links() -> None:
    path = DATA_DIR / "customer_vendor_links.json"
    if not _is_empty(path):
        return
    pairs = [
        ("customera", "vendorx"),
        ("customera", "vendorz"),
        ("customerb", "vendorx"),
        ("customerb", "vendory"),
        ("customerb", "vendorz"),
    ]
    for customer_username, vendor_username in pairs:
        links_svc.create_link(customer_username, vendor_username, actor="system")


def seed_vendor_inventory() -> None:
    path = DATA_DIR / "vendor_inventory.json"
    if not _is_empty(path):
        return
    ts = now_iso()
    records = [
        {"id": 1, "vendor_username": "vendorx", "sku": "STL-CHASSIS-A", "item_name": "Steel Chassis Frame A", "qty_on_hand": 280, "reorder_threshold": 100, "manufacturing_critical": True, "created_at": ts, "updated_at": ts},
        {"id": 2, "vendor_username": "vendorx", "sku": "WIRE-HARN-C", "item_name": "Wire Harness Assembly C", "qty_on_hand": 760, "reorder_threshold": 200, "manufacturing_critical": True, "created_at": ts, "updated_at": ts},
        {"id": 3, "vendor_username": "vendory", "sku": "PLST-HSG-B", "item_name": "Plastic Housing Unit B", "qty_on_hand": 1100, "reorder_threshold": 300, "manufacturing_critical": False, "created_at": ts, "updated_at": ts},
        {"id": 4, "vendor_username": "vendory", "sku": "RUBR-GASKET-D", "item_name": "Rubber Gasket Set D", "qty_on_hand": 3800, "reorder_threshold": 1000, "manufacturing_critical": False, "created_at": ts, "updated_at": ts},
        {"id": 5, "vendor_username": "vendorz", "sku": "MCU-2200X", "item_name": "Microcontroller Chipset 2200X", "qty_on_hand": 420, "reorder_threshold": 500, "manufacturing_critical": True, "created_at": ts, "updated_at": ts},
        {"id": 6, "vendor_username": "vendorz", "sku": "MCU-3300Y", "item_name": "Microcontroller Chipset 3300Y", "qty_on_hand": 90, "reorder_threshold": 400, "manufacturing_critical": True, "created_at": ts, "updated_at": ts},
    ]
    write_json(path, records)


def seed_orders() -> None:
    path = DATA_DIR / "orders.json"
    if not _is_empty(path):
        return
    ts = now_iso()
    records = [
        {
            "id": 1,
            "order_number": "ORD-0001",
            "customer_username": "customera",
            "vendor_username": "vendorx",
            "items": [{"sku": "STL-CHASSIS-A", "item_name": "Steel Chassis Frame A", "qty": 50}],
            "status": "delivered",
            "undelivered_reason": None,
            "requested_at": ts,
            "updated_at": ts,
        },
        {
            "id": 2,
            "order_number": "ORD-0002",
            "customer_username": "customerb",
            "vendor_username": "vendory",
            "items": [{"sku": "PLST-HSG-B", "item_name": "Plastic Housing Unit B", "qty": 200}],
            "status": "requested",
            "undelivered_reason": None,
            "requested_at": ts,
            "updated_at": ts,
        },
    ]
    write_json(path, records)


def seed_customer_inventory_for_seeded_orders() -> None:
    """If ORD-0001 was seeded as already 'delivered', reflect it in customer_inventory."""
    path = DATA_DIR / "customer_inventory.json"
    if not _is_empty(path):
        return
    ts = now_iso()
    records = [
        {
            "id": 1,
            "customer_username": "customera",
            "vendor_username": "vendorx",
            "sku": "STL-CHASSIS-A",
            "item_name": "Steel Chassis Frame A",
            "qty_on_hand": 50,
            "created_at": ts,
            "updated_at": ts,
        },
    ]
    write_json(path, records)


def seed_empty_collections() -> None:
    for filename in ("claims.json", "alerts.json", "audit_logs.json", "vendor_sla.json"):
        path = DATA_DIR / filename
        if not path.exists():
            write_json(path, [])


def run_seed() -> None:
    """Idempotent: only seeds files that are missing or empty. Safe on every startup."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    seed_users()
    seed_links()
    seed_vendor_inventory()
    seed_orders()
    seed_customer_inventory_for_seeded_orders()
    seed_empty_collections()
