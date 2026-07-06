import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/Modal";
import { ENTITY_COLORS } from "../lib/colors";
import { fadeUpItem, staggerContainer } from "../lib/motion";
import type { MyVendor } from "../lib/types";

export default function MyVendors() {
  const { user } = useAuth();
  const { show } = useToast();
  const [vendors, setVendors] = useState<MyVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [removeTarget, setRemoveTarget] = useState<MyVendor | null>(null);
  const [removing, setRemoving] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    try {
      const data = await api.get<MyVendor[]>(`/api/customers/${user.username}/vendors`);
      setVendors(data);
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to load vendors");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function confirmRemove() {
    if (!user || !removeTarget) return;
    setRemoving(true);
    try {
      await api.delete(`/api/customers/${user.username}/vendors/${removeTarget.username}`);
      show("success", `Removed ${removeTarget.display_name}`);
      setVendors((prev) => prev.filter((v) => v.username !== removeTarget.username));
      setRemoveTarget(null);
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to remove vendor");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">My Vendors</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Vendors you deal with, with your order and claim activity against each.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : vendors.length === 0 ? (
        <p className="text-sm text-slate-400">No linked vendors yet.</p>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {vendors.map((v) => (
            <motion.div key={v.username} variants={fadeUpItem}>
              <Card hoverable className={`flex flex-col gap-2 border-l-4 p-4 ${ENTITY_COLORS.vendors.bar}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {v.company_name || v.display_name}
                  </span>
                  <Button size="sm" variant="danger" onClick={() => setRemoveTarget(v)}>
                    Remove
                  </Button>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {v.display_name} · @{v.username}
                </span>
                <div className="mt-1 flex gap-2">
                  <Badge tone="blue">{v.order_count} orders</Badge>
                  <Badge tone="purple">{v.claim_count} claims</Badge>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={confirmRemove}
        title="Remove vendor?"
        message={`Remove ${removeTarget?.display_name ?? "this vendor"}? You'll no longer be able to place orders or file claims against them until you add them back. Past orders/claims are kept.`}
        confirmLabel={removing ? "Removing…" : "Remove"}
      />
    </div>
  );
}
