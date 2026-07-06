"""Customer-vendor relationship table — source of truth for who can order from whom."""
from __future__ import annotations

from app.store import Collection, now_iso
from app.services.audit_logs import log_action

_col = Collection("customer_vendor_links.json")


def list_links() -> list[dict]:
    return sorted(_col.list_all(), key=lambda r: r.get("created_at", ""))


def get_link(link_id: int) -> dict | None:
    return _col.get(link_id)


def is_linked(customer_username: str, vendor_username: str) -> bool:
    return get_link_by_pair(customer_username, vendor_username) is not None


def get_link_by_pair(customer_username: str, vendor_username: str) -> dict | None:
    for link in _col.list_all():
        if link.get("customer_username") == customer_username and link.get("vendor_username") == vendor_username:
            return link
    return None


def vendors_for_customer(customer_username: str) -> list[str]:
    return [r["vendor_username"] for r in _col.list_all() if r.get("customer_username") == customer_username]


def customers_for_vendor(vendor_username: str) -> list[str]:
    return [r["customer_username"] for r in _col.list_all() if r.get("vendor_username") == vendor_username]


def create_link(customer_username: str, vendor_username: str, actor: str = "system") -> dict:
    existing = get_link_by_pair(customer_username, vendor_username)
    if existing:
        return existing
    record = _col.create({
        "customer_username": customer_username,
        "vendor_username": vendor_username,
        "linked_at": now_iso(),
    })
    log_action(actor, "create", "customer_vendor_links", record["id"], f"linked {customer_username} <-> {vendor_username}")
    return record


def set_links_for_customer(customer_username: str, vendor_usernames: list[str], actor: str = "system") -> list[dict]:
    """Replace all links for a customer with the given vendor set."""
    current = [r for r in _col.list_all() if r.get("customer_username") == customer_username]
    for link in current:
        if link.get("vendor_username") not in vendor_usernames:
            _col.delete(link["id"])
            log_action(actor, "delete", "customer_vendor_links", link["id"],
                       f"unlinked {customer_username} <-> {link.get('vendor_username')}")
    results = []
    for vendor_username in vendor_usernames:
        results.append(create_link(customer_username, vendor_username, actor=actor))
    return results


def delete_link(link_id: int, actor: str = "system") -> bool:
    ok = _col.delete(link_id)
    if ok:
        log_action(actor, "delete", "customer_vendor_links", link_id, "deleted link")
    return ok
