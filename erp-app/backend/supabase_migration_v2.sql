-- ============================================================================
-- Freight ERP — Migration v2: Role system update + Sales Orders table
-- Run this in the Supabase SQL Editor AFTER supabase_migration.sql
-- ============================================================================

-- ── 1. UPDATE ROLE CHECK CONSTRAINT ─────────────────────────────────────────
-- Drop old constraint and add new one with all portal roles.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'admin',
    'procurement_officer',
    'inventory_controller',
    'finance_officer',
    'vendor_order_manager',
    'vendor_claim_handler',
    'customer'
  ));

-- ── 2. ADD SO NUMBER COLUMN TO PURCHASE_ORDERS ──────────────────────────────
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS so_number TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS item_name TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS item_code TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS item_quantity INT DEFAULT 1;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS total_cost NUMERIC DEFAULT 0;

-- ── 3. CREATE SALES_ORDERS TABLE ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_orders (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    so_number       TEXT UNIQUE NOT NULL,
    po_id           UUID NOT NULL REFERENCES purchase_orders(id),
    po_number       TEXT,
    vendor_username TEXT NOT NULL REFERENCES users(username),
    dispatched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at    TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'Dispatched',
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Add po_number column if table already existed from a previous run
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS po_number TEXT;

-- ── 4. MIGRATE EXISTING USERS TO NEW ROLES ──────────────────────────────────
-- Map old roles to new roles for any existing rows.
UPDATE users SET role = 'vendor_order_manager' WHERE role = 'vendor';
UPDATE users SET role = 'procurement_officer'  WHERE role = 'warehouse';
-- 'admin' and 'customer' stay as-is.

-- ── 5. DEMO SEED — ERP STAFF ACCOUNTS ───────────────────────────────────────
-- These are internal ERP accounts created by admin (not self-registerable).
-- Passwords: ProcurementOfficer@123, InventoryController@123, FinanceOfficer@123
INSERT INTO users (username, password_hash, role, display_name, email, created_at, updated_at)
VALUES
  ('proc_officer',  '$2b$12$S01xkx8bBLj8lAEldtYhXe/DXjntpFcP8LOzya6L3PNszN7RbPNYy', 'procurement_officer',  'Priya Procurement', 'proc@freighterp.com', now(), now()),
  ('inv_controller','$2b$12$S01xkx8bBLj8lAEldtYhXe/DXjntpFcP8LOzya6L3PNszN7RbPNYy', 'inventory_controller', 'Ivan Inventory',     'inv@freighterp.com',  now(), now()),
  ('fin_officer',   '$2b$12$S01xkx8bBLj8lAEldtYhXe/DXjntpFcP8LOzya6L3PNszN7RbPNYy', 'finance_officer',      'Fiona Finance',      'fin@freighterp.com',  now(), now())
ON CONFLICT (username) DO NOTHING;

-- Note: The password hashes above are the same as admin (Admin@123).
-- Change them in production via the Users management page.
