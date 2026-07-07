import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Input, Select, TextArea } from "../components/ui/Input";
import { ENTITY_COLORS } from "../lib/colors";
import { fadeUpItem, staggerContainer } from "../lib/motion";
import type { Claim, Order } from "../lib/types";
import { APP_NAME } from "../lib/constants";

interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_username: string;
  sku: string;
  item_name: string;
  quantity: number;
  status: string;
}

function statusTone(s: string) {
  if (s === "approved") return "green" as const;
  if (s === "rejected") return "red" as const;
  return "yellow" as const;
}

export default function Claims() {
  const { user } = useAuth();
  const { show } = useToast();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  // vendor reject modal
  const [rejectClaim, setRejectClaim] = useState<Claim | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // email draft modal (ERP roles only)
  const [emailClaim, setEmailClaim] = useState<Claim | null>(null);

  const isErpRole = user?.role === "admin" || user?.role === "procurement_officer" ||
    user?.role === "inventory_controller" || user?.role === "finance_officer";

  const isFinanceOfficer = user?.role === "finance_officer";
  const canFileClaim = isFinanceOfficer || user?.role === "admin" || user?.role === "warehouse";

  async function load() {
    setLoading(true);
    try {
      if (canFileClaim) {
        const [c, pos] = await Promise.all([
          api.get<Claim[]>("/api/claims"),
          api.get<PurchaseOrder[]>("/api/purchase-orders"),
        ]);
        setClaims(c);
        setPurchaseOrders(pos);
      } else {
        const [c, o] = await Promise.all([
          api.get<Claim[]>("/api/claims"),
          api.get<Order[]>("/api/orders"),
        ]);
        setClaims(c);
        setOrders(o);
      }
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to load claims");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function approve(claim: Claim) {
    try {
      await api.put(`/api/claims/${claim.id}/decision`, { status: "approved" });
      show("success", `${claim.claim_number} approved`);
      load();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to update claim");
    }
  }

  async function submitReject() {
    if (!rejectClaim) return;
    try {
      await api.put(`/api/claims/${rejectClaim.id}/decision`, {
        status: "rejected",
        decision_reason: rejectReason,
      });
      show("success", `${rejectClaim.claim_number} rejected`);
      setRejectClaim(null);
      setRejectReason("");
      load();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to update claim");
    }
  }

  // customer can only claim against their own delivered orders
  const deliveredOrders = useMemo(
    () => orders.filter((o) => o.status === "delivered"),
    [orders]
  );

  const orderNumberFor = (id: number) =>
    orders.find((o) => o.id === id)?.order_number ?? `#${id}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Claims</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {user?.role === "customer"
              ? "Raise and track claims against delivered orders."
              : user?.role === "vendor_order_manager" || user?.role === "vendor_claim_handler"
              ? "Incoming claims — approve or reject."
              : user?.role === "finance_officer"
              ? "All claims across the platform. File a claim on behalf of a customer."
              : "All claims across the platform."}
          </p>
        </div>
        {(user?.role === "customer" || canFileClaim) && (
          <Button onClick={() => setCreateOpen(true)}>+ New Claim</Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : claims.length === 0 ? (
        <p className="text-sm text-slate-400">No claims yet.</p>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 lg:grid-cols-2 items-stretch"
        >
          {claims.map((c) => (
            <motion.div key={c.id} variants={fadeUpItem} className="h-full">
              <Card hoverable className={`h-full flex flex-col gap-2 border-l-4 p-4 ${ENTITY_COLORS.claims.bar}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{c.claim_number}</span>
                  <div className="flex items-center gap-2">
                    {isErpRole && (c as any).email_draft && (
                      <button
                        title="View draft claim email"
                        onClick={() => setEmailClaim(c)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-700 dark:hover:text-blue-400 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </button>
                    )}
                    <Badge tone={statusTone(c.status)} dot>
                      {c.status}
                    </Badge>
                  </div>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {c.customer_company_name || c.customer_username || APP_NAME} → {c.vendor_company_name || c.vendor_username} · {c.order_number ?? (c.order_id != null ? orderNumberFor(c.order_id) : "—")}
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {c.damage_type} · {c.sku} · ×{c.damaged_qty}
                </p>
                {(c as any).claim_value != null && (
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    Claim Value: ₹{Number((c as any).claim_value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    {(c as any).cost_per_unit != null && (
                      <span className="text-xs font-normal text-slate-400 ml-1">@ ₹{(c as any).cost_per_unit}/unit</span>
                    )}
                  </p>
                )}
                {(c as any).claim_percentage != null && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    SLA Entitlement:{" "}
                    <span className={`font-semibold ${(c as any).claim_percentage < 100 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {(c as any).claim_percentage}% of damaged item value
                    </span>
                    {(c as any).claim_percentage < 100 && (
                      <span className="ml-1 text-slate-400">(SLA cap applied)</span>
                    )}
                  </p>
                )}
                <div className="flex-1 overflow-y-auto max-h-52 rounded bg-slate-50 dark:bg-slate-800/50 px-2.5 py-2">
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{c.claim_text}</p>
                  {c.decision_reason && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">Reason: {c.decision_reason}</p>
                  )}
                </div>
                <div className="mt-auto pt-1 flex items-center justify-between gap-2">
                  {c.created_at && (
                    <p className="text-[11px] text-slate-400">{new Date(c.created_at).toLocaleString()}</p>
                  )}
                </div>
                {user?.role === "vendor_claim_handler" && c.status === "pending" && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => approve(c)}>
                      Approve
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setRejectClaim(c)}>
                      Reject
                    </Button>
                  </div>
                )}
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {(user?.role === "customer" || canFileClaim) && (
        <NewClaimModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          orders={deliveredOrders}
          purchaseOrders={purchaseOrders.filter((p) => p.status === "Delivered")}
          isFinanceOfficer={canFileClaim}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}

      {/* Email draft modal — ERP roles only */}
      <Modal
        open={!!emailClaim}
        onClose={() => setEmailClaim(null)}
        title={`Draft Claim Email — ${emailClaim?.claim_number ?? ""}`}
      >
        {emailClaim && (
          <div className="flex flex-col gap-4">
            <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
              <span className="font-semibold">To:</span> {emailClaim.vendor_company_name || emailClaim.vendor_username} &nbsp;·&nbsp;
              <span className="font-semibold">Re:</span> {emailClaim.claim_number} / {emailClaim.order_number ?? `Order #${emailClaim.order_id}`}
            </div>
            <pre className="whitespace-pre-wrap rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-sans overflow-auto max-h-[60vh]">
              {(emailClaim as any).email_draft}
            </pre>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText((emailClaim as any).email_draft ?? "");
                }}
              >
                Copy to Clipboard
              </Button>
              <Button onClick={() => setEmailClaim(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!rejectClaim}
        onClose={() => setRejectClaim(null)}
        title={`Reject ${rejectClaim?.claim_number ?? ""}`}
      >
        <div className="flex flex-col gap-3">
          <TextArea
            label="Reason"
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Why is this claim rejected?"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRejectClaim(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={submitReject}>
              Reject
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function NewClaimModal({
  open,
  onClose,
  orders,
  purchaseOrders = [],
  isFinanceOfficer = false,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  orders: Order[];
  purchaseOrders?: PurchaseOrder[];
  isFinanceOfficer?: boolean;
  onCreated: () => void;
}) {
  const { show } = useToast();
  const [orderId, setOrderId] = useState<number | "">("");
  const [poId, setPoId] = useState<string>("");
  const [sku, setSku] = useState("");
  const [damageType, setDamageType] = useState("");
  const [damagedQty, setDamagedQty] = useState(1);
  const [claimText, setClaimText] = useState("");
  const [claimValue, setClaimValue] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const selectedOrder = orders.find((o) => o.id === orderId);
  const selectedPO = purchaseOrders.find((p) => p.id === poId);

  async function submit() {
    if (isFinanceOfficer) {
      if (!poId) { show("error", "Pick a purchase order"); return; }
      if (!sku || !damageType || !claimText) { show("error", "Fill all fields"); return; }
      setSubmitting(true);
      try {
        await api.post("/api/claims", { po_id: poId, sku, damage_type: damageType, damaged_qty: damagedQty, claim_text: claimText, claim_value: claimValue !== "" ? parseFloat(claimValue) : null });
        show("success", "Claim filed");
        reset(); onCreated();
      } catch (err) {
        show("error", err instanceof ApiError ? err.message : "Failed to file claim");
      } finally { setSubmitting(false); }
      return;
    }
    if (!orderId) { show("error", "Pick an order"); return; }
    if (!sku || !damageType || !claimText) { show("error", "Fill all fields"); return; }
    setSubmitting(true);
    try {
      await api.post("/api/claims", { order_id: orderId, sku, damage_type: damageType, damaged_qty: damagedQty, claim_text: claimText, claim_value: claimValue !== "" ? parseFloat(claimValue) : null });
      show("success", "Claim filed");
      reset(); onCreated();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to file claim");
    } finally { setSubmitting(false); }
  }

  function reset() {
    setOrderId(""); setPoId(""); setSku(""); setDamageType(""); setDamagedQty(1); setClaimText(""); setClaimValue("");
  }


  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="New Claim">
      <div className="flex flex-col gap-3">
        {isFinanceOfficer ? (
          <>
            <Select
              label="Purchase Order (Delivered only)"
              value={poId}
              onChange={(e) => {
                const id = e.target.value;
                setPoId(id);
                // auto-fill SKU from PO
                const po = purchaseOrders.find((p) => p.id === id);
                setSku(po?.sku ?? "");
              }}
            >
              <option value="">Select a PO…</option>
              {purchaseOrders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.po_number} — {p.item_name} ({p.sku}) · {(p as any).vendor_company_name || p.vendor_username}
                </option>
              ))}
            </Select>
            {purchaseOrders.length === 0 && (
              <p className="text-xs text-amber-600">No delivered purchase orders to claim against yet.</p>
            )}
            {selectedPO && (
              <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                Vendor: <span className="font-semibold">{(selectedPO as any).vendor_company_name || selectedPO.vendor_username}</span> · SKU: <span className="font-semibold">{selectedPO.sku}</span> · Qty: {selectedPO.quantity}
              </div>
            )}
            <Input label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Auto-filled from PO" />
          </>
        ) : (
          <>
            <Select
              label="Order (delivered only)"
              value={orderId}
              onChange={(e) => {
                const id = e.target.value ? parseInt(e.target.value, 10) : "";
                setOrderId(id); setSku("");
              }}
            >
              <option value="">Select an order…</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_number} ({o.vendor_username})
                </option>
              ))}
            </Select>
            {orders.length === 0 && (
              <p className="text-xs text-amber-600">No delivered orders to claim against yet.</p>
            )}
            {selectedOrder && (
              <Select label="SKU" value={sku} onChange={(e) => setSku(e.target.value)}>
                <option value="">Select a SKU…</option>
                {selectedOrder.items.map((it) => (
                  <option key={it.sku} value={it.sku}>
                    {it.item_name} ({it.sku})
                  </option>
                ))}
              </Select>
            )}
          </>
        )}

        <Input label="Damage type" value={damageType} onChange={(e) => setDamageType(e.target.value)} placeholder="e.g. crushed, water damage" />
        <Input
          label="Damaged qty"
          type="number"
          min={1}
          value={damagedQty}
          onChange={(e) => setDamagedQty(parseInt(e.target.value || "0", 10))}
        />
        <Input
          label="Claim value (₹)"
          type="number"
          min={0}
          step={0.01}
          value={claimValue}
          onChange={(e) => setClaimValue(e.target.value)}
          placeholder="e.g. 15000.00"
        />
        <TextArea label="Description" rows={3} value={claimText} onChange={(e) => setClaimText(e.target.value)} />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Filing…" : "File Claim"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
