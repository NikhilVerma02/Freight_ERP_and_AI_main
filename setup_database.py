"""
Freight Platform — Database Setup Script
========================================
Reads credentials from .env and provisions the Supabase database.

Two modes:
  1. AUTO (recommended): Add SUPABASE_SERVICE_KEY to .env — script creates all
     tables and seeds data automatically via the Supabase pg/query API.
  2. MANUAL fallback: Script prints the SQL file path for you to paste into the
     Supabase SQL Editor at https://supabase.com/dashboard.

Usage:
  python setup_database.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Inject corporate CA trust store before any network calls (fixes SSL on internal networks)
try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

# ── Load .env ────────────────────────────────────────────────────────────────
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(env_path)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")          # anon key (read/write data)
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY", "")  # service_role key (DDL + bypass RLS)

SQL_FILE = Path(__file__).parent / "erp-app" / "backend" / "supabase_complete_setup.sql"

# ─────────────────────────────────────────────────────────────────────────────
def _project_ref() -> str:
    """Extract project reference ID from SUPABASE_URL."""
    # https://eriuwcfclgfbntsndder.supabase.co  → eriuwcfclgfbntsndder
    host = SUPABASE_URL.replace("https://", "").replace("http://", "")
    return host.split(".")[0]


def run_sql_via_api(sql: str, key: str) -> tuple[bool, str]:
    """POST SQL to the Supabase pg/query REST endpoint (requires service_role key)."""
    import urllib.request
    import urllib.error
    import json

    project_ref = _project_ref()
    # The internal PG Meta endpoint — accessible with the service_role JWT
    url = f"{SUPABASE_URL}/pg/query"

    payload = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
            "apikey": key,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8")
            return True, body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return False, f"HTTP {e.code}: {body}"
    except Exception as exc:
        return False, str(exc)


def check_connectivity() -> bool:
    """Verify we can reach the Supabase project at all."""
    import urllib.request
    import urllib.error
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/users?select=username&limit=1",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            code = resp.getcode()
            return code < 400
    except urllib.error.HTTPError as e:
        # 406 = table doesn't exist yet (acceptable)
        # 200/206 = table exists
        return e.code in (200, 206, 406)
    except Exception as exc:
        print(f"  Connection error: {exc}")
        return False


def seed_admin_via_client():
    """Use supabase-py to insert the admin user (works after tables are created)."""
    try:
        from supabase import create_client
        key = SERVICE_KEY or SUPABASE_KEY
        client = create_client(SUPABASE_URL, key)
        # Check if admin already exists
        result = client.table("users").select("username").eq("username", "admin").execute()
        if result.data:
            print("  admin user already exists — skipping seed.")
            return True
        # Insert admin with bcrypt hash for Admin@123
        client.table("users").insert({
            "username": "admin",
            "password_hash": "$2b$12$S01xkx8bBLj8lAEldtYhXe/DXjntpFcP8LOzya6L3PNszN7RbPNYy",
            "role": "admin",
            "display_name": "Alex Admin",
            "email": "admin@freighterp.com",
        }).execute()
        print("  admin user seeded (password: Admin@123).")
        return True
    except Exception as exc:
        print(f"  Could not seed admin via client: {exc}")
        return False


def print_manual_instructions():
    print()
    print("=" * 70)
    print("MANUAL SETUP REQUIRED")
    print("=" * 70)
    print()
    print("The service_role key is needed to create tables automatically.")
    print("Please follow these steps instead:")
    print()
    print("  1. Open your Supabase project dashboard:")
    print(f"     https://supabase.com/dashboard/project/{_project_ref()}/sql/new")
    print()
    print("  2. Copy the contents of this SQL file:")
    print(f"     {SQL_FILE}")
    print()
    print("  3. Paste it into the SQL Editor and click 'Run'.")
    print()
    print("  THEN add the service_role key to .env to avoid needing this step")
    print("  in the future:")
    print()
    print("  SUPABASE_SERVICE_KEY=eyJ...  <- from Supabase Settings -> API ->")
    print("                                   'service_role' secret")
    print()


# ─────────────────────────────────────────────────────────────────────────────
def main():
    print()
    print("Freight Platform — Database Setup")
    print("=" * 40)

    if not SUPABASE_URL:
        print("ERROR: SUPABASE_URL not set in .env")
        sys.exit(1)
    if not SUPABASE_KEY:
        print("ERROR: SUPABASE_KEY not set in .env")
        sys.exit(1)

    print(f"Project : {_project_ref()}")
    print(f"URL     : {SUPABASE_URL}")
    print(f"SQL file: {SQL_FILE}")
    print()

    if not SQL_FILE.exists():
        print(f"ERROR: SQL file not found: {SQL_FILE}")
        sys.exit(1)

    sql = SQL_FILE.read_text(encoding="utf-8")

    # ── Try automatic DDL via service_role key ────────────────────────────
    if SERVICE_KEY:
        print("[1/3] Service_role key found — running SQL automatically...")
        ok, msg = run_sql_via_api(sql, SERVICE_KEY)
        if ok:
            print("  Tables created successfully!")
        else:
            print(f"  pg/query API failed: {msg}")
            print("  Trying split-statement execution...")
            # Split on semicolons and run statement-by-statement
            statements = [s.strip() for s in sql.split(";") if s.strip() and not s.strip().startswith("--")]
            errors = []
            for stmt in statements:
                ok2, msg2 = run_sql_via_api(stmt + ";", SERVICE_KEY)
                if not ok2 and "already exists" not in msg2.lower():
                    errors.append(f"  WARN: {msg2[:120]}")
            if errors:
                for e in errors[:5]:
                    print(e)
            else:
                print("  All statements executed.")
    else:
        print("[1/3] No SUPABASE_SERVICE_KEY in .env — skipping automatic DDL.")
        print_manual_instructions()

    # ── Check connectivity ────────────────────────────────────────────────
    print()
    print("[2/3] Checking database connectivity...")
    reachable = check_connectivity()
    if reachable:
        print("  Supabase project is reachable.")
    else:
        print("  Could not reach Supabase project. Check URL and network.")

    # ── Seed admin user ───────────────────────────────────────────────────
    print()
    print("[3/3] Seeding admin user...")
    seed_admin_via_client()

    print()
    print("Done.")
    print()
    print("Demo credentials (all use password: Admin@123)")
    print("-" * 45)
    print("ERP Portal     (port 5173) : admin / Admin@123")
    print("                           : proc_officer / Admin@123")
    print("                           : inv_controller / Admin@123")
    print("                           : fin_officer / Admin@123")
    print("Vendor Portal  (port 5175) : vendor_acme / Admin@123")
    print("                           : vendor_abc / Admin@123")
    print("                           : admin / Admin@123  (full access)")
    print("Customer Portal(port 5176) : customer_a / Admin@123")
    print("                           : customer_b / Admin@123")
    print("                           : admin / Admin@123  (full access)")
    print()


if __name__ == "__main__":
    main()
