import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Input } from "../components/ui/Input";
import { ENTITY_COLORS } from "../lib/colors";
import { fadeUpItem, staggerContainer } from "../lib/motion";
import type { MyCustomer, User } from "../lib/types";

export default function MyCustomers() {
  const { user } = useAuth();
  const { show } = useToast();
  const [customers, setCustomers] = useState<MyCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    try {
      const data = await api.get<MyCustomer[]>(`/api/vendors/${user.username}/customers`);
      setCustomers(data);
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const linkedUsernames = useMemo(() => new Set(customers.map((c) => c.username)), [customers]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">My Customers</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Customers linked to you, with their order and claim activity.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>+ Add Customer</Button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : customers.length === 0 ? (
        <p className="text-sm text-slate-400">No linked customers yet.</p>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {customers.map((c) => (
            <motion.div key={c.username} variants={fadeUpItem}>
              <Card hoverable className={`flex flex-col gap-2 border-l-4 p-4 ${ENTITY_COLORS.customers.bar}`}>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {c.display_name}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  @{c.username}
                  {c.company_name ? ` · ${c.company_name}` : ""}
                </span>
                <div className="mt-1 flex gap-2">
                  <Badge tone="blue">{c.order_count} orders</Badge>
                  <Badge tone="purple">{c.claim_count} claims</Badge>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      <AddCustomerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        alreadyLinked={linkedUsernames}
        onAdded={() => {
          load();
        }}
      />
    </div>
  );
}

function AddCustomerModal({
  open,
  onClose,
  alreadyLinked,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  alreadyLinked: Set<string>;
  onAdded: () => void;
}) {
  const { show } = useToast();
  const [allUsers, setAllUsers] = useState<User[] | null>(null);
  const [search, setSearch] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    if (allUsers !== null) return; // already loaded once this session
    api
      .get<User[]>("/api/users")
      .then(setAllUsers)
      .catch((err) => show("error", err instanceof ApiError ? err.message : "Failed to load customers"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const availableCustomers = useMemo(() => {
    const customers = (allUsers || []).filter((u) => u.role === "customer" && !alreadyLinked.has(u.username));
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.username.toLowerCase().includes(q) ||
        c.display_name.toLowerCase().includes(q) ||
        (c.company_name || "").toLowerCase().includes(q)
    );
  }, [allUsers, alreadyLinked, search]);

  async function connect(username: string) {
    setConnecting(username);
    try {
      await api.post("/api/links/connect-customer", { customer_username: username });
      show("success", `Added ${username}`);
      onAdded();
      onClose();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to add customer");
    } finally {
      setConnecting(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Customer">
      <div className="flex flex-col gap-3">
        <Input
          autoFocus
          placeholder="Search by username, name, or company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {allUsers === null ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : availableCustomers.length === 0 ? (
          <p className="text-sm text-slate-400">
            {search ? "No matching customers." : "No more customers available to add."}
          </p>
        ) : (
          <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {availableCustomers.map((c) => (
              <div
                key={c.username}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-navy-600"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{c.display_name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    @{c.username}
                    {c.company_name ? ` · ${c.company_name}` : ""}
                  </p>
                </div>
                <Button size="sm" onClick={() => connect(c.username)} disabled={connecting === c.username}>
                  {connecting === c.username ? "Adding…" : "Add"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
