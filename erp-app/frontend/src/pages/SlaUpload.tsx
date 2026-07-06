import React, { useEffect, useRef, useState } from "react";
import { api, ApiError, BASE_URL } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/Modal";
import { AskSlaBox } from "../components/AskSlaBox";
import type { MyCustomer, User, VendorSla } from "../lib/types";

export default function SlaUpload() {
  const { user } = useAuth();
  const { show } = useToast();
  const isProcOfficer = user?.role === "procurement_officer" || user?.role === "admin" || user?.role === "warehouse";

  const [slas, setSlas] = useState<VendorSla[]>([]);
  const [customers, setCustomers] = useState<MyCustomer[]>([]);
  const [vendors, setVendors] = useState<User[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [selectedVendor, setSelectedVendor] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      if (isProcOfficer) {
        const [slaList, userList] = await Promise.all([
          api.get<VendorSla[]>("/api/vendors/sla"),
          api.get<User[]>("/api/users"),
        ]);
        setSlas(slaList);
        setVendors(userList.filter((u) => u.role === "vendor_order_manager" || u.role === "vendor"));
      } else {
        const [slaList, customerList] = await Promise.all([
          api.get<VendorSla[]>("/api/vendors/sla"),
          user ? api.get<MyCustomer[]>(`/api/vendors/${user.username}/customers`) : Promise.resolve([]),
        ]);
        setSlas(slaList.filter((s) => s.vendor_username === user?.username));
        setCustomers(customerList);
      }
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to load SLAs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username]);

  function toggleCustomer(username: string) {
    setSelectedCustomers((prev) =>
      prev.includes(username) ? prev.filter((c) => c !== username) : [...prev, username]
    );
  }

  function pickFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      show("error", "Only PDF files are supported");
      return;
    }
    setPendingFile(file);
  }

  async function upload() {
    if (!pendingFile) return;
    if (isProcOfficer && !selectedVendor) {
      show("error", "Select a vendor to upload the SLA for");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", pendingFile);
      if (isProcOfficer) {
        form.append("vendor_username", selectedVendor);
      } else {
        form.append("vendor_username", user?.username ?? "");
      }
      form.append("customer_usernames", "[]");
      const token = localStorage.getItem("erp_token");
      const res = await fetch(`${BASE_URL}/api/vendors/sla/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      if (!res.ok) {
        let detail = `Upload failed (${res.status})`;
        try {
          detail = (await res.json()).detail || detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      show("success", "SLA uploaded and indexed for AI Q&A");
      setPendingFile(null);
      setSelectedCustomers([]);
      setSelectedVendor("");
      load();
    } catch (err) {
      show("error", err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function deleteSla(id: number) {
    setDeletingId(id);
    try {
      await api.delete(`/api/vendors/sla/${id}`);
      show("success", "SLA deleted");
      setSlas((prev) => prev.filter((s) => s.id !== id));
      setConfirmId(null);
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to delete SLA");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Upload SLA</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {isProcOfficer
            ? "Upload a vendor SLA document. Select the vendor this SLA belongs to — it will be indexed for AI Q&A."
            : "Upload your Service Level Agreement PDF. It's automatically indexed so you and your linked customers can ask AI questions about it."}
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) pickFile(f);
        }}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-12 text-center transition-colors ${
          dragOver
            ? "border-accent bg-accent/5"
            : "border-slate-300 dark:border-navy-600"
        }`}
      >
        <span className="text-3xl">📄</span>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {pendingFile ? pendingFile.name : "Drag & drop a PDF here, or"}
        </p>
        <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
          Choose file
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {pendingFile && (
        <Card className="flex flex-col gap-3 p-4">
          {isProcOfficer ? (
            <>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Upload SLA for which vendor?
              </p>
              {vendors.length === 0 ? (
                <p className="text-sm text-slate-400">No vendors found.</p>
              ) : (
                <select
                  value={selectedVendor}
                  onChange={(e) => setSelectedVendor(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-200"
                >
                  <option value="">Select a vendor…</option>
                  {vendors.map((v) => (
                    <option key={v.username} value={v.username}>
                      {v.company_name || v.display_name}
                    </option>
                  ))}
                </select>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              This SLA will be uploaded for your vendor account and made available to your linked customers automatically.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              onClick={upload}
              disabled={uploading || (isProcOfficer && !selectedVendor)}
            >
              {uploading ? "Uploading…" : "Upload SLA"}
            </Button>
            <Button variant="secondary" onClick={() => setPendingFile(null)} disabled={uploading}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        onConfirm={() => confirmId !== null && deleteSla(confirmId)}
        message="Delete this SLA document? Customers you shared it with will no longer be able to view or ask about it."
      />
    </div>
  );
}
