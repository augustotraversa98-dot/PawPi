import { useState } from "react";
import { Loader2, Pill } from "lucide-react";
import { toast } from "sonner";
import {
  useProviderRxFulfillment,
  useRxFulfillmentAction,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";
import { centsToCurrency, dollarsToCents } from "../lib/money";

// Provider Rx FULFILLMENT QUEUE (Wave 7 ticket 2.71). A `pharmacy`-capable provider sees incoming
// fulfillment orders (pet + drug from the linked Rx, delivery/pickup), sets a price, accepts, and
// advances status. Marking 'fulfilled' consumes a refill on the 2.53 safe path server-side. The only
// clinical field shown is the prescribed drug — fulfillment never pulls the whole Vet Record. Empty
// → an empty state; a non-pharmacy provider gets a clean "capability" message (403 from the API).

const NEXT_STATUS = {
  requested: "accepted",
  accepted: "preparing",
  preparing: "ready",
  ready: "out_for_delivery",
  out_for_delivery: "fulfilled",
};
const STATUS_LABEL = {
  requested: "Requested",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

function PriceEditor({ order, onSave, disabled }) {
  const [raw, setRaw] = useState(
    order.price_cents != null ? (order.price_cents / 100).toFixed(2) : "",
  );
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-[#7A6254]">$</span>
      <input
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="0.00"
        className="w-24 rounded-lg border border-[#FFD9B3] px-2 py-1 text-sm"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const { cents, error } = dollarsToCents(raw);
          if (error) return toast.error(error);
          onSave(cents);
        }}
        className="rounded-lg bg-[#FFF1E2] px-3 py-1 text-sm font-semibold text-[#B75D32] disabled:opacity-50"
      >
        Set price
      </button>
    </div>
  );
}

export default function PharmacyQueue({ providerId }) {
  const { data, isLoading, isError, error } = useProviderRxFulfillment(providerId);
  const action = useRxFulfillmentAction(providerId);

  const run = (orderId, patch, verb) =>
    action.mutate(
      { orderId, ...patch },
      {
        onSuccess: () => toast.success(verb),
        onError: (e) => toast.error(e?.message || "Action failed"),
      },
    );

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: COLORS.coral }} />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-[#FFD9B3] bg-white p-8 text-center">
          <p className="text-sm text-[#7A6254]">
            {error?.status === 403
              ? "This business doesn't offer Rx fulfillment (the 'pharmacy' capability)."
              : error?.message || "Couldn't load the fulfillment queue."}
          </p>
        </div>
      </div>
    );
  }

  const orders = data?.orders ?? [];

  return (
    <div className="p-6">
      <header className="mb-6 flex items-center gap-2">
        <Pill className="h-6 w-6" style={{ color: COLORS.coral }} />
        <div>
          <h1 className="text-2xl font-bold text-[#3B241B]">Rx Fulfillment</h1>
          <p className="text-sm text-[#7A6254]">
            Incoming prescription fulfillment orders — only this provider's.
          </p>
        </div>
      </header>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-[#FFD9B3] bg-white p-10 text-center text-sm text-[#B8A99D]">
          No fulfillment orders yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => {
            const next = NEXT_STATUS[o.status];
            const terminal = o.status === "fulfilled" || o.status === "cancelled";
            return (
              <li
                key={o.id}
                className="rounded-2xl border border-[#FFD9B3] bg-white p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-[#3B241B]">
                      {o.drug_name || "Medication"}
                      {o.strength ? ` · ${o.strength}` : ""}
                    </p>
                    <p className="text-sm text-[#7A6254]">
                      {o.pet_name || "Pet"}
                      {o.owner_name ? ` · ${o.owner_name}` : ""} ·{" "}
                      {o.method === "pickup" ? "Pickup" : "Delivery"}
                      {o.method === "delivery" && o.delivery_address
                        ? ` · ${o.delivery_address}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-[#7A6254]">
                      {o.is_refill ? "Refill" : "Fill"} ·{" "}
                      {o.refills_remaining ?? 0} refills left
                      {o.price_cents != null
                        ? ` · ${centsToCurrency(o.price_cents)}`
                        : ""}
                      {o.order_status === "paid" ? " · Paid" : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#FFF1E2] px-2.5 py-1 text-xs font-semibold text-[#B75D32]">
                    {STATUS_LABEL[o.status] || o.status}
                  </span>
                </div>

                {!terminal && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[#FFF1E2] pt-3">
                    <PriceEditor
                      order={o}
                      disabled={action.isPending}
                      onSave={(cents) =>
                        run(o.id, { price_cents: cents }, "Price set")
                      }
                    />
                    {next && (
                      <button
                        type="button"
                        disabled={action.isPending}
                        onClick={() =>
                          run(
                            o.id,
                            { status: next },
                            `Marked ${STATUS_LABEL[next].toLowerCase()}`,
                          )
                        }
                        className="rounded-lg bg-[#FF6F61] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {next === "fulfilled"
                          ? "Mark fulfilled"
                          : `Mark ${STATUS_LABEL[next].toLowerCase()}`}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={action.isPending}
                      onClick={() =>
                        run(o.id, { status: "cancelled" }, "Cancelled")
                      }
                      className="rounded-lg px-3 py-1.5 text-sm font-semibold text-[#B23A2E] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
