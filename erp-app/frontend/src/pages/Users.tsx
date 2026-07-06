import React, { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal, ConfirmDialog } from "../components/ui/Modal";
import { Input, Select } from "../components/ui/Input";
import type { User, Role, CustomerVendorLink } from "../lib/types";

interface UsersProps {
  filterRole?: Role;
  title?: string;
}

interface FormState {
  username: string;
  password: string;
  role: Role;
  display_name: string;
  company_name: string;
  email: string;
  vendor_usernames: string[];
}

function emptyForm(role: Role): FormState {
  return {
    username: "",
    password: "",
    role,
    display_name: "",
    company_name: "",
    email: "",
    vendor_usernames: [],
  };
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  procurement_officer: "Procurement Officer",
  inventory_controller: "Inventory Controller",
  finance_officer: "Finance Officer",
  vendor_order_manager: "Vendor – Order Manager",
  vendor_claim_handler: "Vendor – Claim Handler",
  customer: "Customer",
};

function roleTone(r: string) {
  if (r === "admin") return "purple" as const;
  if (r === "procurement_officer" || r === "inventory_controller" || r === "finance_officer")
    return "yellow" as const;
  if (r === "vendor_order_manager" || r === "vendor_claim_handler") return "blue" as const;
  return "green" as const;
}

export default function Users({ filterRole, title }: UsersProps) {
  const { show } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [links, setLinks] = useState<CustomerVendorLink[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(filterRole ?? "vendor"));
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [passwordPolicy, setPasswordPolicy] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ description: string }>("/api/auth/password-policy")
      .then((res) => setPasswordPolicy(res.description))
      .catch(() => {
        /* non-critical hint text — fail silently */
      });
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [u, l] = await Promise.all([
        api.get<User[]>("/api/users"),
        api.get<CustomerVendorLink[]>("/api/links"),
      ]);
      const ERP_ROLES = new Set(["admin", "warehouse", "vendor", "procurement_officer", "inventory_controller", "finance_officer"]);
      setUsers(u.filter((x) => ERP_ROLES.has(x.role)));
      setLinks(l);
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vendorUsernames = useMemo(
    () => users.filter((u) => u.role === "vendor").map((u) => u.username),
    [users]
  );

  function linksFor(customer: string): string[] {
    return links.filter((l) => l.customer_username === customer).map((l) => l.vendor_username);
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(filterRole ?? "vendor"));
    setModalOpen(true);
  }

  function openEdit(u: User) {
    setEditing(u);
    setForm({
      username: u.username,
      password: "",
      role: u.role,
      display_name: u.display_name,
      company_name: u.company_name ?? "",
      email: u.email ?? "",
      vendor_usernames: u.role === "customer" ? linksFor(u.username) : [],
    });
    setModalOpen(true);
  }

  function toggleVendor(v: string) {
    setForm((f) => ({
      ...f,
      vendor_usernames: f.vendor_usernames.includes(v)
        ? f.vendor_usernames.filter((x) => x !== v)
        : [...f.vendor_usernames, v],
    }));
  }

  async function save() {
    try {
      if (editing) {
        const body: Record<string, unknown> = {
          display_name: form.display_name,
          company_name: form.company_name || null,
          email: form.email || null,
        };
        if (form.password) body.password = form.password;
        if (form.role === "customer") body.vendor_usernames = form.vendor_usernames;
        await api.put(`/api/users/${editing.username}`, body);
        show("success", "User updated");
      } else {
        const body: Record<string, unknown> = {
          username: form.username,
          password: form.password,
          role: form.role,
          display_name: form.display_name,
          company_name: form.company_name || null,
          email: form.email || null,
        };
        if (form.role === "customer") body.vendor_usernames = form.vendor_usernames;
        await api.post("/api/users", body);
        show("success", "User created");
      }
      setModalOpen(false);
      load();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to save user");
    }
  }

  async function confirmDelete() {
    if (!deleteUser) return;
    try {
      await api.delete(`/api/users/${deleteUser.username}`);
      show("success", "User deleted");
      setDeleteUser(null);
      load();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to delete");
    }
  }

  const visible = filterRole ? users.filter((u) => u.role === filterRole) : users;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {title ?? "Users"}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Create and manage accounts. Customers can be linked to vendors.
          </p>
        </div>
        <Button onClick={openCreate}>+ New {filterRole ?? "User"}</Button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-400">No users.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((u) => (
            <Card key={u.username} className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900 dark:text-slate-100">{u.company_name || u.display_name}</span>
                <Badge tone={roleTone(u.role)} dot>
                  {ROLE_LABELS[u.role] ?? u.role}
                </Badge>
              </div>
              <span className="text-xs text-slate-500">{u.display_name} · @{u.username}</span>
              {u.email && <span className="text-xs text-slate-500">{u.email}</span>}
              {u.role === "customer" && (
                <div className="flex flex-wrap gap-1">
                  {linksFor(u.username).map((v) => (
                    <Badge key={v} tone="blue">
                      {v}
                    </Badge>
                  ))}
                </div>
              )}
              {u.role !== "admin" && (
                <div className="mt-1 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(u)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleteUser(u)}>
                    Delete
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit User" : "New User"}>
        <div className="flex flex-col gap-3">
          {!editing && (
            <Input label="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          )}
          {!editing && !filterRole && (
            <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="procurement_officer">Procurement Officer</option>
              <option value="inventory_controller">Inventory Controller</option>
              <option value="finance_officer">Finance Officer</option>
            </Select>
          )}
          <Input label="Display name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          <Input label="Company name" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
          <Input label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div>
            <Input
              label={editing ? "New password (leave blank to keep)" : "Password"}
              type="password"
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            {passwordPolicy && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{passwordPolicy}</p>}
          </div>
          {form.role === "customer" && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Linked vendors</span>
              <div className="flex flex-wrap gap-2">
                {vendorUsernames.length === 0 && (
                  <span className="text-xs text-slate-400">No vendors exist yet.</span>
                )}
                {vendorUsernames.map((v) => {
                  const on = form.vendor_usernames.includes(v);
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => toggleVendor(v)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
                        on
                          ? "bg-accent text-white ring-accent"
                          : "bg-white text-slate-600 ring-slate-300 dark:bg-navy-800 dark:text-slate-300 dark:ring-navy-600"
                      }`}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteUser}
        onClose={() => setDeleteUser(null)}
        onConfirm={confirmDelete}
        message={`Delete user @${deleteUser?.username}? This cannot be undone.`}
      />
    </div>
  );
}
