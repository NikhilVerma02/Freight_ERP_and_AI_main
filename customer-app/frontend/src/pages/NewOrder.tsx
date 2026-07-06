import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export default function NewOrder() {
  const { show } = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [requiredBy, setRequiredBy] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/api/orders", {
        items,
        quantity: quantity ? parseInt(quantity, 10) : null,
        notes,
        total_amount: totalAmount ? parseFloat(totalAmount) : null,
        required_by: requiredBy || null,
      });
      show("success", "Order submitted to ERP");
      navigate("/orders");
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to place order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Place New Order</h1>
        <p className="text-sm text-slate-500 mt-1">Submit your request to the ERP system. Our team will fulfil it from the right vendor.</p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            id="items"
            label="Items / Description"
            placeholder="e.g. 50x Steel Chassis A, 20x Bolts M12"
            value={items}
            onChange={(e) => setItems(e.target.value)}
            required
          />

          <Input
            id="quantity"
            label="Quantity"
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 50"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />

          <Input
            id="amount"
            label="Estimated Amount (₹)"
            type="number"
            min="0"
            step="0.01"
            placeholder="Optional"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
          />

          <Input
            id="required-by"
            label="Required By"
            type="date"
            value={requiredBy}
            onChange={(e) => setRequiredBy(e.target.value)}
          />

          <Input
            id="notes"
            label="Notes"
            placeholder="Delivery instructions, urgency, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => navigate("/orders")}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit Order"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
