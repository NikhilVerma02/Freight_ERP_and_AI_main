import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Input } from "../components/ui/Input";

interface User {
  username: string;
  display_name: string;
  company_name?: string;
  email?: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  vendor_order_manager: "Order Manager",
  vendor_claim_handler: "Claim Handler",
};

const PORTAL_ROLES = ["vendor_order_manager", "vendor_claim_handler"];

interface FormState {
  username: string;
  password: string;
  display_name: string;
  company_name: string;
  email: string;
  role: string;
}

const EMPTY_FORM: FormState = {
  username: "",
  password: "",
  display_name: "",
  company_name: "",
  email: "",
  role: "vendor_order_manager",
};

export default function Users() {
  const { user: me } = useAuth();
  const { show } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingUsername, setDeletingUsername] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);

  async function load() {
    setLoading(true);
    try {
      const all = await api.get<User[]>("/api/users");
      setUsers(all.filter((u) => PORTAL_ROLES.includes(u.role)));
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(u: User) {
    setEditing(u);
    setForm({ username: u.username, password: "", display_name: u.display_name, company_name: u.company_name ?? "", email: u.email ?? "", role: u.role });
    setModalOpen(true);
  }

  async function save() {
    if (!form.display_name.trim()) { show("error", "Display name is required"); return; }
    if (!editing && !form.username.trim()) { show("error", "Username is required"); return; }
    if (!editing && !form.password.trim()) { show("error", "Password is required"); return; }
    setSaving(true);
    try {
      if (editing) {
        const body: Record<string, string> = { display_name: form.display_name, company_name: form.company_name, email: form.email };
        if (form.password) body.password = form.password;
        await api.put(`/api/users/${editing.username}`, body);
        show("success", "User updated");
      } else {
        await api.post("/api/users", { username: form.username.trim().toLowerCase(), password: form.password, display_name: form.display_name, company_name: form.company_name, email: form.email, role: form.role });
        show("success", "User created");
      }
      setModalOpen(false);
      load();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to save user");
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(username: string) {
    setDeletingUsername(username);
    try {
      await api.delete(`/api/users/${username}`);
      show("success", "User deleted");
      setUsers((prev) => prev.filter((u) => u.username !== username));
      setConfirmDelete(null);
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to delete user");
    } finally {
      setDeletingUsername(null);
    }
  }

  const f = (key: keyof FormState) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((p) => ({ ...p, [key]: e.target.value })),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Users</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage vendor portal accounts.</p>
        </div>
        <Button onClick={openCreate}>+ New User</Button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-slate-400">No users yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {users.map((u) => (
            <Card key={u.username} className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-slate-900 dark:text-slate-100">{u.display_name}</p>
                <span className="shrink-0 rounded-full border border-current px-2 py-0.5 text-[11px] font-medium text-accent">
                  {ROLE_LABELS[u.role] ?? u.role}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">@{u.username}</p>
              {u.email && <p className="text-xs text-slate-400">{u.email}</p>}
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" onClick={() => openEdit(u)}>Edit</Button>
                {u.username !== me?.username && (
                  <Button variant="danger" onClick={() => setConfirmDelete(u)} disabled={deletingUsername === u.username}>
                    {deletingUsername === u.username ? "Deleting…" : "Delete"}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit User" : "New User"}>
        <div className="flex flex-col gap-3">
          {!editing && (
            <>
              <Input id="username" label="Username" placeholder="e.g. john_doe" {...f("username")} />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Role</label>
                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-100"
                  value={form.role}
                  onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                >
                  <option value="vendor_order_manager">Order Manager</option>
                  <option value="vendor_claim_handler">Claim Handler</option>
                </select>
              </div>
            </>
          )}
          <Input id="display_name" label="Display Name" placeholder="Full name" {...f("display_name")} />
          <Input id="company_name" label="Company Name" placeholder="Optional" {...f("company_name")} />
          <Input id="email" label="Email" type="email" placeholder="Optional" {...f("email")} />
          <Input id="password" label={editing ? "New Password (leave blank to keep)" : "Password"} type="password" placeholder="••••••••" {...f("password")} />
          <div className="flex gap-2 pt-1">
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Save Changes" : "Create User"}</Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="Delete User?">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          Delete <strong>{confirmDelete?.display_name}</strong> (@{confirmDelete?.username})? This cannot be undone.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => confirmDelete && deleteUser(confirmDelete.username)}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
