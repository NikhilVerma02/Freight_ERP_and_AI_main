"""
Idempotent seed script — computer manufacturing plant demo context.

NovaTech Computers (compufact) assembles 50 desktop PCs per day.
Vendors: ProChip Electronics (procchip) and PowerCage Systems (powercage).

daily_production_requirement lives on vendor_inventory and is set by
ERP admin/warehouse operators — vendors cannot set it. It represents units
consumed per working day at the 50 PCs/day build rate.

Safe to call on every startup — each file is only written if missing or empty.
SLA documents are NOT seeded here; upload them via the vendor SLA page.
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
    demo_users = [
        # (username, password, role, display_name, company_name, email)
        ("admin",        "Admin@123",      "admin",     "Alex Admin",          None,                    "admin@freighterp.com"),
        ("warehouse_op",  "Warehouse@123", "warehouse",            "Warehouse Operator",           "NovaTech Computers",             "warehouse@novatech.com"),
        ("compufact",     "Admin@123",    "customer",             "NovaTech Computers",           "NovaTech Computers",             "procurement@novatech.com"),
        # Vertex Techchips — vendor parent account (used as vendor_username in orders/inventory)
        ("vertextech",    "Admin@123",    "vendor",               "Vertex Techchips",             "Vertex Techchips Private Ltd.",  "info@vertextechchips.com"),
        # Vertex Techchips — portal sub-users (log into vendor-app)
        ("vertex_mgr",    "Admin@123",    "vendor_order_manager", "Vertex Order Manager",         "Vertex Techchips Private Ltd.",  "orders@vertextechchips.com"),
        ("vertex_claims", "Admin@123",    "vendor_claim_handler", "Vertex Claims Handler",        "Vertex Techchips Private Ltd.",  "claims@vertextechchips.com"),
    ]
    ts = now_iso()
    records = []
    for username, password, role, display_name, company_name, email in demo_users:
        records.append({
            "username": username,
            "password_hash": hash_password(password),
            "role": role,
            "display_name": display_name,
            "company_name": company_name,
            "email": email,
            "created_at": ts,
            "updated_at": ts,
        })
    write_json(path, records)


def seed_links() -> None:
    path = DATA_DIR / "customer_vendor_links.json"
    if not _is_empty(path):
        return
    pairs = [
        ("compufact", "vertextech"),
    ]
    for customer_username, vendor_username in pairs:
        links_svc.create_link(customer_username, vendor_username, actor="system")


def seed_vendor_inventory() -> None:
    """
    ERP portal inventory (admin/warehouse view).
    daily_production_requirement = units/day at NovaTech's 50 PCs/day build rate.
    Set by ERP operators — vendors cannot set this field.

    Production halt risk items after damaged shipments (< 2 days coverage):
      GPU-RTX4080  : 55 units / 30 per day = 1.8 days  ← CRITICAL
      RAM-DDR5-32G : 80 units / 100 per day = 0.8 days ← CRITICAL
    """
    path = DATA_DIR / "vendor_inventory.json"
    if not _is_empty(path):
        return
    ts = now_iso()
    records = [
        # Vertex Techchips Private Ltd. — CPUs, GPUs, RAM, Motherboards, PSUs, Cases, SSDs, Coolers
        {"id": 1, "vendor_username": "vertextech", "sku": "CPU-I9-14K",    "item_name": "Intel Core i9-14900K Processor", "qty_on_hand": 170, "reorder_threshold": 100, "manufacturing_critical": True,  "daily_production_requirement": 50,  "created_at": ts, "updated_at": ts},
        {"id": 2, "vendor_username": "vertextech", "sku": "GPU-RTX4080",   "item_name": "NVIDIA RTX 4080 Graphics Card",  "qty_on_hand": 55,  "reorder_threshold": 60,  "manufacturing_critical": True,  "daily_production_requirement": 30,  "created_at": ts, "updated_at": ts},
        {"id": 3, "vendor_username": "vertextech", "sku": "RAM-DDR5-32G",  "item_name": "DDR5 32GB RAM Module",           "qty_on_hand": 80,  "reorder_threshold": 100, "manufacturing_critical": True,  "daily_production_requirement": 100, "created_at": ts, "updated_at": ts},
        {"id": 4, "vendor_username": "vertextech", "sku": "MOBO-Z790",     "item_name": "Z790 ATX Motherboard",           "qty_on_hand": 185, "reorder_threshold": 100, "manufacturing_critical": True,  "daily_production_requirement": 50,  "created_at": ts, "updated_at": ts},
        {"id": 5, "vendor_username": "vertextech", "sku": "PSU-850W-GOLD", "item_name": "850W 80+ Gold PSU",             "qty_on_hand": 190, "reorder_threshold": 75,  "manufacturing_critical": False, "daily_production_requirement": 50,  "created_at": ts, "updated_at": ts},
        {"id": 6, "vendor_username": "vertextech", "sku": "CASE-ATX-PRO",  "item_name": "ATX Pro Full Tower Case",       "qty_on_hand": 145, "reorder_threshold": 75,  "manufacturing_critical": False, "daily_production_requirement": 50,  "created_at": ts, "updated_at": ts},
        {"id": 7, "vendor_username": "vertextech", "sku": "SSD-NVME-2TB",  "item_name": "2TB NVMe M.2 SSD",             "qty_on_hand": 210, "reorder_threshold": 75,  "manufacturing_critical": True,  "daily_production_requirement": 50,  "created_at": ts, "updated_at": ts},
        {"id": 8, "vendor_username": "vertextech", "sku": "COOL-240-AIO",  "item_name": "240mm AIO Liquid Cooler",      "qty_on_hand": 160, "reorder_threshold": 60,  "manufacturing_critical": False, "daily_production_requirement": 50,  "created_at": ts, "updated_at": ts},
    ]
    write_json(path, records)


def seed_orders() -> None:
    path = DATA_DIR / "orders.json"
    if not _is_empty(path):
        return
    ts = now_iso()
    records = [
        # Delivered orders (factory received stock)
        {"id": 1, "order_number": "ORD-0001", "customer_username": "compufact", "vendor_username": "vertextech",  "items": [{"sku": "CPU-I9-14K",   "item_name": "Intel Core i9-14900K Processor", "qty": 200}], "status": "delivered", "undelivered_reason": None, "requested_at": "2026-07-01T10:00:00+00:00", "updated_at": "2026-07-02T08:00:00+00:00"},
        {"id": 2, "order_number": "ORD-0002", "customer_username": "compufact", "vendor_username": "vertextech",  "items": [{"sku": "GPU-RTX4080",  "item_name": "NVIDIA RTX 4080 Graphics Card",  "qty": 120}], "status": "delivered", "undelivered_reason": None, "requested_at": "2026-07-01T10:15:00+00:00", "updated_at": "2026-07-02T09:00:00+00:00"},
        {"id": 3, "order_number": "ORD-0003", "customer_username": "compufact", "vendor_username": "vertextech",  "items": [{"sku": "RAM-DDR5-32G", "item_name": "DDR5 32GB RAM Module",           "qty": 400}], "status": "delivered", "undelivered_reason": None, "requested_at": "2026-07-01T10:30:00+00:00", "updated_at": "2026-07-02T10:00:00+00:00"},
        {"id": 4, "order_number": "ORD-0004", "customer_username": "compufact", "vendor_username": "vertextech",  "items": [{"sku": "MOBO-Z790",    "item_name": "Z790 ATX Motherboard",           "qty": 200}], "status": "delivered", "undelivered_reason": None, "requested_at": "2026-07-01T11:00:00+00:00", "updated_at": "2026-07-02T11:00:00+00:00"},
        {"id": 5, "order_number": "ORD-0005", "customer_username": "compufact", "vendor_username": "vertextech", "items": [{"sku": "PSU-850W-GOLD", "item_name": "850W 80+ Gold PSU",            "qty": 200}], "status": "delivered", "undelivered_reason": None, "requested_at": "2026-07-01T11:30:00+00:00", "updated_at": "2026-07-02T12:00:00+00:00"},
        {"id": 6, "order_number": "ORD-0006", "customer_username": "compufact", "vendor_username": "vertextech", "items": [{"sku": "SSD-NVME-2TB",  "item_name": "2TB NVMe M.2 SSD",            "qty": 300}], "status": "delivered", "undelivered_reason": None, "requested_at": "2026-07-01T12:00:00+00:00", "updated_at": "2026-07-02T13:00:00+00:00"},
        # Pending orders
        {"id": 7, "order_number": "ORD-0007", "customer_username": "compufact", "vendor_username": "vertextech",  "items": [{"sku": "MOBO-Z790",    "item_name": "Z790 ATX Motherboard",           "qty": 100}], "status": "requested", "undelivered_reason": None, "requested_at": "2026-07-05T09:00:00+00:00", "updated_at": "2026-07-05T09:00:00+00:00"},
        {"id": 8, "order_number": "ORD-0008", "customer_username": "compufact", "vendor_username": "vertextech", "items": [{"sku": "CASE-ATX-PRO",  "item_name": "ATX Pro Full Tower Case",      "qty": 150}], "status": "requested", "undelivered_reason": None, "requested_at": "2026-07-05T09:30:00+00:00", "updated_at": "2026-07-05T09:30:00+00:00"},
    ]
    write_json(path, records)


def seed_customer_inventory() -> None:
    """Factory floor stock received by NovaTech after deliveries."""
    path = DATA_DIR / "customer_inventory.json"
    if not _is_empty(path):
        return
    ts = now_iso()
    records = [
        # From procchip
        {"id": 1, "customer_username": "compufact", "vendor_username": "vertextech",  "sku": "CPU-I9-14K",    "item_name": "Intel Core i9-14900K Processor", "qty_on_hand": 200, "created_at": ts, "updated_at": ts},
        {"id": 2, "customer_username": "compufact", "vendor_username": "vertextech",  "sku": "GPU-RTX4080",   "item_name": "NVIDIA RTX 4080 Graphics Card",  "qty_on_hand": 55,  "created_at": ts, "updated_at": ts},
        {"id": 3, "customer_username": "compufact", "vendor_username": "vertextech",  "sku": "RAM-DDR5-32G",  "item_name": "DDR5 32GB RAM Module",           "qty_on_hand": 80,  "created_at": ts, "updated_at": ts},
        {"id": 4, "customer_username": "compufact", "vendor_username": "vertextech",  "sku": "MOBO-Z790",     "item_name": "Z790 ATX Motherboard",           "qty_on_hand": 200, "created_at": ts, "updated_at": ts},
        # From powercage
        {"id": 5, "customer_username": "compufact", "vendor_username": "vertextech", "sku": "PSU-850W-GOLD", "item_name": "850W 80+ Gold PSU",             "qty_on_hand": 200, "created_at": ts, "updated_at": ts},
        {"id": 6, "customer_username": "compufact", "vendor_username": "vertextech", "sku": "SSD-NVME-2TB",  "item_name": "2TB NVMe M.2 SSD",             "qty_on_hand": 210, "created_at": ts, "updated_at": ts},
        {"id": 7, "customer_username": "compufact", "vendor_username": "vertextech", "sku": "COOL-240-AIO",  "item_name": "240mm AIO Liquid Cooler",      "qty_on_hand": 150, "created_at": ts, "updated_at": ts},
        {"id": 8, "customer_username": "compufact", "vendor_username": "vertextech", "sku": "CASE-ATX-PRO",  "item_name": "ATX Pro Full Tower Case",       "qty_on_hand": 130, "created_at": ts, "updated_at": ts},
    ]
    write_json(path, records)


def seed_claims() -> None:
    """
    Two claims that trigger production halt (GPU impact + RAM water damage),
    one that doesn't (SSD ESD damage — 4.2 days of stock remaining).
    """
    path = DATA_DIR / "claims.json"
    if not _is_empty(path):
        return
    ts = now_iso()
    records = [
        {
            "id": 1, "claim_number": "CLM-0001",
            "customer_username": "compufact", "vendor_username": "vertextech", "order_id": 2,
            "sku": "GPU-RTX4080", "damage_type": "impact", "damaged_qty": 65,
            "claim_text": (
                "Claim for ORD-0002: 120 NVIDIA RTX 4080 GPUs ordered; 65 arrived with severe impact "
                "damage — PCIe connectors shattered, PCBs visibly cracked. Remaining 55 undamaged units "
                "cover only 1.8 days of production (30 GPUs/day required). Immediate halt risk."
            ),
            "status": "pending", "decision_reason": None, "created_at": ts, "updated_at": ts,
        },
        {
            "id": 2, "claim_number": "CLM-0002",
            "customer_username": "compufact", "vendor_username": "vertextech", "order_id": 3,
            "sku": "RAM-DDR5-32G", "damage_type": "water_damage", "damaged_qty": 320,
            "claim_text": (
                "Claim for ORD-0003: 400 DDR5 32GB RAM modules ordered; 320 arrived with water damage — "
                "corrosion on memory chips renders them non-functional. Only 80 undamaged units remain, "
                "covering 0.8 days of production (100 modules/day). Assembly line will halt within hours."
            ),
            "status": "pending", "decision_reason": None, "created_at": ts, "updated_at": ts,
        },
        {
            "id": 3, "claim_number": "CLM-0003",
            "customer_username": "compufact", "vendor_username": "vertextech", "order_id": 6,
            "sku": "SSD-NVME-2TB", "damage_type": "electrostatic", "damaged_qty": 90,
            "claim_text": (
                "Claim for ORD-0006: 300 NVMe SSDs ordered; 90 show ESD damage on NAND controllers — "
                "drives detected but read/write operations fail. 210 undamaged units give ~4.2 days buffer. "
                "No immediate halt risk but replacement needed within the week."
            ),
            "status": "pending", "decision_reason": None, "created_at": ts, "updated_at": ts,
        },
    ]
    write_json(path, records)


def seed_empty_collections() -> None:
    for filename in ("alerts.json", "audit_logs.json", "vendor_sla.json", "purchase_orders.json"):
        p = DATA_DIR / filename
        if not p.exists():
            write_json(p, [])


def ensure_vertextech_user() -> None:
    """Always ensure the vertextech parent vendor account exists.
    This account is used as vendor_username in POs/orders and must survive manual user edits."""
    path = DATA_DIR / "users.json"
    users = read_json(path) or []
    if any(u.get("username") == "vertextech" for u in users):
        return
    ts = now_iso()
    users.append({
        "username": "vertextech",
        "password_hash": hash_password("Admin@123"),
        "role": "vendor",
        "display_name": "Vertex Techchips",
        "company_name": "Vertex Techchips Private Ltd.",
        "email": "info@vertextechchips.com",
        "created_at": ts,
        "updated_at": ts,
    })
    write_json(path, users)


def run_seed() -> None:
    """Idempotent: only seeds files that are missing or empty. Safe on every startup."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    seed_users()
    seed_links()
    seed_vendor_inventory()
    seed_orders()
    seed_customer_inventory()
    seed_claims()
    seed_empty_collections()
    ensure_vertextech_user()  # always runs — survives manual user wipes
