import { useState } from "react";
import { Loader2, Pill } from "lucide-react";
import { toast } from "sonner";
import {
  useProviderRxFulfillment,
  useRxFulfillmentAction,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";
import { centsToCurrency, centsToInput, dollarsToCents } from "../lib/money";
import pharmacyCopy from "../i18n/pharmacy";
import { useProviderCopy } from "../i18n/lib/useProviderCopy";
import { plural } from "../i18n/lib/format";
import { serverErrorMessage } from "../i18n/lib/serverError";

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
function PriceEditor({ order, onSave, disabled }) {
  const { t, lang } = useProviderCopy(pharmacyCopy);
  const [raw, setRaw] = useState(centsToInput(order.price_cents, lang));
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-[#7A6254]">$</span>
      <input
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={centsToInput(0, lang)}
        inputMode="decimal"
        className="w-24 rounded-lg border border-[#FFD9B3] px-2 py-1 text-sm"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const { cents, error } = dollarsToCents(raw, lang);
          if (error) return toast.error(error);
          onSave(cents);
        }}
        className="rounded-lg bg-[#FFF1E2] px-3 py-1 text-sm font-semibold text-[#B75D32] disabled:opacity-50"
      >
        {t.setPrice}
      </button>
    </div>
  );
}

export default function PharmacyQueue({ providerId }) {
  const { data, isLoading, isError, error } = useProviderRxFulfillment(providerId);
  const action = useRxFulfillmentAction(providerId);
  const { t, lang } = useProviderCopy(pharmacyCopy);

  const run = (orderId, patch, verb) =>
    action.mutate(
      { orderId, ...patch },
      {
        onSuccess: () => toast.success(verb),
        onError: (e) => toast.error(serverErrorMessage(e, lang, t.actionFailed, pharmacyCopy)),
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
              ? t.noCapability
              : serverErrorMessage(error, lang, t.loadFailed, pharmacyCopy)}
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
          <h1 className="text-2xl font-bold text-[#3B241B]">{t.title}</h1>
          <p className="text-sm text-[#7A6254]">{t.subtitle}</p>
        </div>
      </header>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-[#FFD9B3] bg-white p-10 text-center text-sm text-[#B8A99D]">
          {t.empty}
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
                      {o.drug_name || t.medicationFallback}
                      {o.strength ? ` · ${o.strength}` : ""}
                    </p>
                    <p className="text-sm text-[#7A6254]">
                      {o.pet_name || t.petFallback}
                      {o.owner_name ? ` · ${o.owner_name}` : ""} ·{" "}
                      {o.method === "pickup" ? t.pickup : t.delivery}
                      {o.method === "delivery" && o.delivery_address
                        ? ` · ${o.delivery_address}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-[#7A6254]">
                      {o.is_refill ? t.refill : t.fill} ·{" "}
                      {plural(t.refillsLeft, o.refills_remaining ?? 0, lang)}
                      {o.price_cents != null
                        ? ` · ${centsToCurrency(o.price_cents, lang)}`
                        : ""}
                      {o.order_status === "paid" ? ` · ${t.paid}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#FFF1E2] px-2.5 py-1 text-xs font-semibold text-[#B75D32]">
                    {t.status[o.status] ?? o.status}
                  </span>
                </div>

                {!terminal && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[#FFF1E2] pt-3">
                    <PriceEditor
                      order={o}
                      disabled={action.isPending}
                      onSave={(cents) =>
                        run(o.id, { price_cents: cents }, t.priceSet)
                      }
                    />
                    {next && (
                      <button
                        type="button"
                        disabled={action.isPending}
                        onClick={() =>
                          run(o.id, { status: next }, t.marked[next])
                        }
                        className="rounded-lg bg-[#FF6F61] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {t.mark[next]}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={action.isPending}
                      onClick={() =>
                        run(o.id, { status: "cancelled" }, t.cancelled)
                      }
                      className="rounded-lg px-3 py-1.5 text-sm font-semibold text-[#B23A2E] disabled:opacity-50"
                    >
                      {t.cancel}
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
