import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

interface Inspector {
  username: string;
  display_name: string;
  email: string | null;
  role: string;
}

interface InspectorForm {
  username: string;
  password: string;
  display_name: string;
  email: string;
}

const emptyForm: InspectorForm = { username: "", password: "", display_name: "", email: "" };

export default function Inspectors() {
  const { token } = useAuth();
  const [inspectors, setInspectors] = useState<Inspector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<InspectorForm>(emptyForm);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [editTarget, setEditTarget] = useState<Inspector | null>(null);
  const [editForm, setEditForm] = useState<Partial<InspectorForm>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Inspector | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function fetchInspectors() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Inspector[]>("/api/users");
      setInspectors(data);
    } catch (e: any) {
      setError(e.message ?? "Failed to load inspectors");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchInspectors(); }, [token]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);
    try {
      await api.post("/api/users", createForm);
      setShowCreate(false);
      setCreateForm(emptyForm);
      await fetchInspectors();
    } catch (e: any) {
      setCreateError(e.message ?? "Failed to create inspector");
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEditLoading(true);
    setEditError(null);
    const patch: Record<string, string> = {};
    if (editForm.display_name) patch.display_name = editForm.display_name;
    if (editForm.email !== undefined) patch.email = editForm.email;
    if (editForm.password) patch.password = editForm.password;
    try {
      await api.put(`/api/users/${editTarget.username}`, patch);
      setEditTarget(null);
      setEditForm({});
      await fetchInspectors();
    } catch (e: any) {
      setEditError(e.message ?? "Failed to update inspector");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/api/users/${deleteTarget.username}`);
      setDeleteTarget(null);
      await fetchInspectors();
    } catch (e: any) {
      setError(e.message ?? "Failed to delete inspector");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Inspectors</h1>
          <p className="mt-0.5 text-sm text-slate-400">Manage freight inspector accounts for this AI portal.</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreateForm(emptyForm); setCreateError(null); }}
          className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-accent-400 transition-colors"
        >
          + New Inspector
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Loadingâ€¦</div>
      ) : inspectors.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-6 py-10 text-center text-sm text-slate-500">
          No inspectors yet. Create one to get started.
        </div>
      ) : (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 divide-y divide-slate-800">
          {inspectors.map((ins) => (
            <div key={ins.username} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="font-medium text-slate-100">{ins.display_name}</p>
                <p className="text-xs font-mono text-accent-400">{ins.username}</p>
                {ins.email && <p className="text-xs text-slate-500">{ins.email}</p>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setEditTarget(ins); setEditForm({ display_name: ins.display_name, email: ins.email ?? "", password: "" }); setEditError(null); }}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-accent-400 hover:text-accent-300 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeleteTarget(ins)}
                  className="rounded-md border border-rose-800/50 px-3 py-1.5 text-xs text-rose-400 hover:border-rose-500 hover:text-rose-300 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <Modal title="New Inspector" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <Field label="Username">
              <input className={inputCls} required value={createForm.username} onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))} />
            </Field>
            <Field label="Display Name">
              <input className={inputCls} required value={createForm.display_name} onChange={(e) => setCreateForm((f) => ({ ...f, display_name: e.target.value }))} />
            </Field>
            <Field label="Password">
              <input className={inputCls} required type="password" value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} />
            </Field>
            <Field label="Email (optional)">
              <input className={inputCls} type="email" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} />
            </Field>
            {createError && <p className="text-xs text-rose-400">{createError}</p>}
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowCreate(false)} className={cancelCls}>Cancel</button>
              <button type="submit" disabled={createLoading} className={submitCls}>{createLoading ? "Creatingâ€¦" : "Create"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit modal */}
      {editTarget && (
        <Modal title={`Edit â€” ${editTarget.username}`} onClose={() => setEditTarget(null)}>
          <form onSubmit={handleEdit} className="space-y-4">
            <Field label="Display Name">
              <input className={inputCls} value={editForm.display_name ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))} />
            </Field>
            <Field label="Email">
              <input className={inputCls} type="email" value={editForm.email ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
            </Field>
            <Field label="New Password (leave blank to keep)">
              <input className={inputCls} type="password" value={editForm.password ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} />
            </Field>
            {editError && <p className="text-xs text-rose-400">{editError}</p>}
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setEditTarget(null)} className={cancelCls}>Cancel</button>
              <button type="submit" disabled={editLoading} className={submitCls}>{editLoading ? "Savingâ€¦" : "Save"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <Modal title="Delete Inspector" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-slate-300">
            Delete <span className="font-mono text-accent-300">{deleteTarget.username}</span>? This cannot be undone.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setDeleteTarget(null)} className={cancelCls}>Cancel</button>
            <button onClick={handleDelete} disabled={deleteLoading} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 transition-colors disabled:opacity-50">
              {deleteLoading ? "Deletingâ€¦" : "Delete"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 shadow-glow p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">âœ•</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400/30";
const cancelCls = "rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500 transition-colors";
const submitCls = "rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-accent-400 transition-colors disabled:opacity-50";

