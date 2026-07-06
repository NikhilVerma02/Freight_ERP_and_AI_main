import React, { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";

const BASE = "http://localhost:8001";
const TOKEN_KEY = "customer_token";

async function apiReq<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).detail ?? msg; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

interface User {
  username: string;
  display_name: string;
  email?: string;
  role: string;
}

interface FormState {
  username: string;
  password: string;
  display_name: string;
  email: string;
}

const EMPTY_FORM: FormState = { username: "", password: "", display_name: "", email: "" };

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
      const all = await apiReq<User[]>("GET", "/api/users");
      setUsers(all.filter((u) => u.role === "customer"));
    } catch (err) {
      show("error", err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setForm(EMPTY_FORM); setModalOpen(true); }
  function openEdit(u: User) {
    setEditing(u);
    setForm({ username: u.username, password: "", display_name: u.display_name, email: u.email ?? "" });
    setModalOpen(true);
  }

  function field(key: keyof FormState) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [key]: e.target.value })),
    };
  }

  async function save() {
    if (!form.display_name.trim()) { show("error", "Display name is required"); return; }
    if (!editing && !form.username.trim()) { show("error", "Username is required"); return; }
    if (!editing && !form.password.trim()) { show("error", "Password is required"); return; }
    setSaving(true);
    try {
      if (editing) {
        const body: Record<string, string> = { display_name: form.display_name, email: form.email };
        if (form.password) body.password = form.password;
        await apiReq("PUT", `/api/users/${editing.username}`, body);
        show("success", "User updated");
      } else {
        await apiReq("POST", "/api/users", { username: form.username.trim().toLowerCase(), password: form.password, display_name: form.display_name, email: form.email, role: "customer" });
        show("success", "Customer created");
      }
      setModalOpen(false);
      load();
    } catch (err) {
      show("error", err instanceof Error ? err.message : "Failed to save user");
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(username: string) {
    setDeletingUsername(username);
    try {
      await apiReq("DELETE", `/api/users/${username}`);
      show("success", "User deleted");
      setUsers((prev) => prev.filter((u) => u.username !== username));
      setConfirmDelete(null);
    } catch (err) {
      show("error", err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setDeletingUsername(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Customers</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage customer portal accounts.</p>
        </div>
        <Button onClick={openCreate}>+ New Customer</Button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-slate-400">No customers yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {users.map((u) => (
            <Card key={u.username} className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-slate-900 dark:text-slate-100">{u.display_name}</p>
                <span className="shrink-0 rounded-full border border-emerald-500 px-2 py-0.5 text-[11px] font-medium text-emerald-500">Customer</span>
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
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Customer" : "New Customer"}>
        <div className="flex flex-col gap-3 pt-1">
          {!editing && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Username</label>
              <input className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-100 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20" placeholder="e.g. john_doe" {...field("username")} />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Display Name</label>
            <input className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-100 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20" placeholder="Full name" {...field("display_name")} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Email</label>
            <input type="email" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-100 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20" placeholder="Optional" {...field("email")} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{editing ? "New Password (leave blank to keep)" : "Password"}</label>
            <input type="password" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-100 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20" placeholder="••••••••" {...field("password")} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Save Changes" : "Create Customer"}</Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="Delete Customer?">
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
