import { useMemo, useState } from "react";
import {
  DollarSign,
  TrendingUp,
  Scissors,
  RefreshCcw,
  Wallet,
  Loader2,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "../../../client-integrations/recharts";
import { useProviderSales } from "../hooks/useProviders";
import { COLORS } from "../lib/colors";
import PaymentAccountCard from "./PaymentAccountCard";

// Provider SALES / PAYOUTS / RECONCILIATION (Wave 7 ticket 2.69). Read-only surfacing of the 2.3
// money already captured: revenue (net/gross over the last 6 months), a transactions ledger
// (payments × orders), payout history + the pending balance, and an aggregate reconciliation that
// ties captured → orders → payouts. NO money is mutated here. Every figure is scoped to the active
// provider; this screen NEVER reads another business's money. Empty data → empty states.

// Format integer cents in the provider's currency (e.g. "ARS 1,250.00").
function formatMoney(cents, currency) {
  const v = (Number(cents) || 0) / 100;
  return `${currency || "ARS"} ${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const LEDGER_TYPE_LABEL = {
  booking: "Booking",
  product: "Order",
  adoption_fee: "Adoption fee",
  donation: "Donation",
  subscription: "Subscription",
};

function StatCard({ Icon, label, value, sub, accent }) {
  return (
    <div className="flex-1 rounded-2xl border border-[#FFD9B3] bg-white p-5">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: (accent || COLORS.coral) + "22" }}
        >
          <Icon className="h-5 w-5" style={{ color: accent || COLORS.coral }} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#7A6254]">
            {label}
          </p>
          <p className="text-2xl font-bold text-[#3B241B]">{value}</p>
        </div>
      </div>
      {sub ? <p className="mt-2 text-sm text-[#7A6254]">{sub}</p> : null}
    </div>
  );
}

function StatusPill({ status }) {
  const tone =
    status === "approved" || status === "paid"
      ? "bg-[#E6F4EC] text-[#2F7D54]"
      : status === "refunded" || status === "failed"
        ? "bg-[#FBE7E4] text-[#B23A2E]"
        : "bg-[#FFF1E2] text-[#B75D32]";
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${tone}`}
    >
      {status || "—"}
    </span>
  );
}

export default function ProviderSales({ providerId }) {
  const { data, isLoading, isError, error } = useProviderSales(providerId);
  const [metric, setMetric] = useState("net"); // "net" | "gross"

  const currency = data?.currency ?? "ARS";

  // recharts wants display dollars on the axis; map cents → number once for the chosen metric.
  const revenueSeries = useMemo(
    () =>
      (data?.revenue?.by_month ?? []).map((m) => ({
        month: m.month,
        value: Math.round(
          (Number(metric === "gross" ? m.gross_cents : m.net_cents) || 0) / 100,
        ),
      })),
    [data, metric],
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2
          className="h-7 w-7 animate-spin"
          style={{ color: COLORS.coral }}
        />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-[#FFD9B3] bg-white p-8 text-center">
          <p className="text-sm text-[#7A6254]">
            {error?.message || "Couldn't load your sales."}
          </p>
        </div>
      </div>
    );
  }

  const revenue = data?.revenue ?? {};
  const payouts = data?.payouts ?? { rows: [] };
  const recon = data?.reconciliation ?? {};
  const ledger = data?.ledger ?? [];

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[#3B241B]">Sales</h1>
        <p className="text-sm text-[#7A6254]">
          Revenue, payouts and reconciliation — only this provider's money, read-only.
        </p>
      </header>

      {/* Payment account connection (ACTION 2 §1) — provider links their own MercadoPago
          account here; without it, checkout stays "payments not configured" for them. */}
      <PaymentAccountCard providerId={providerId} />

      {/* Headline stats */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row">
        <StatCard
          Icon={DollarSign}
          label="Net revenue"
          value={formatMoney(revenue.net_cents, currency)}
          sub={`${revenue.approved_count ?? 0} paid transactions`}
          accent={COLORS.coral}
        />
        <StatCard
          Icon={TrendingUp}
          label="Gross"
          value={formatMoney(revenue.gross_cents, currency)}
          sub="before commission & refunds"
          accent={COLORS.terracotta}
        />
        <StatCard
          Icon={Scissors}
          label="Commission"
          value={formatMoney(revenue.commission_cents, currency)}
          sub="platform fee (set by platform)"
          accent="#9A6CB4"
        />
        <StatCard
          Icon={RefreshCcw}
          label="Refunds"
          value={formatMoney(revenue.refunds_cents, currency)}
          sub="returned to customers"
          accent="#B23A2E"
        />
      </div>

      {/* Revenue trend */}
      <div className="mb-6 rounded-2xl border border-[#FFD9B3] bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-[#3B241B]">
            Revenue by month ({currency})
          </h2>
          <div className="flex overflow-hidden rounded-lg border border-[#FFD9B3] text-xs font-semibold">
            {["net", "gross"].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                className={`px-3 py-1.5 capitalize ${
                  metric === m
                    ? "bg-[#FF6F61] text-white"
                    : "bg-white text-[#7A6254]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        {revenueSeries.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-[#B8A99D]">
            No sales yet.
          </div>
        ) : (
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={revenueSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#FFE9D6" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: "#7A6254" }}
                />
                <YAxis tick={{ fontSize: 12, fill: "#7A6254" }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={COLORS.coral}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Payouts + reconciliation */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#FFD9B3] bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Wallet className="h-5 w-5" style={{ color: COLORS.coral }} />
            <h2 className="text-base font-bold text-[#3B241B]">Payouts</h2>
          </div>
          <div className="mb-4 flex gap-4">
            <div className="flex-1 rounded-xl bg-[#FFF8F1] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7A6254]">
                Paid out
              </p>
              <p className="text-lg font-bold text-[#3B241B]">
                {formatMoney(payouts.paid_out_cents, currency)}
              </p>
            </div>
            <div className="flex-1 rounded-xl bg-[#FFF8F1] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7A6254]">
                Pending
              </p>
              <p className="text-lg font-bold text-[#3B241B]">
                {formatMoney(payouts.pending_payout_cents, currency)}
              </p>
            </div>
          </div>
          {payouts.rows.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-[#B8A99D]">
              No payouts yet.
            </div>
          ) : (
            <ul className="divide-y divide-[#FFF1E2]">
              {payouts.rows.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between py-2.5"
                >
                  <div>
                    <p className="font-semibold text-[#3B241B]">
                      {formatMoney(p.amount_cents, currency)}
                    </p>
                    <p className="text-xs text-[#7A6254]">
                      {String(p.created_at).slice(0, 10)} · {p.rail || "—"}
                    </p>
                  </div>
                  <StatusPill status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-[#FFD9B3] bg-white p-5">
          <h2 className="mb-4 text-base font-bold text-[#3B241B]">
            Reconciliation
          </h2>
          <p className="mb-4 text-xs text-[#7A6254]">
            What you've earned versus what you've been paid.
          </p>
          <dl className="divide-y divide-[#FFF1E2]">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-sm text-[#7A6254]">Net captured</dt>
              <dd className="font-semibold text-[#3B241B]">
                {formatMoney(recon.net_captured_cents, currency)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-sm text-[#7A6254]">Paid out</dt>
              <dd className="font-semibold text-[#3B241B]">
                − {formatMoney(recon.paid_out_cents, currency)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-sm text-[#7A6254]">Pending payout</dt>
              <dd className="font-semibold text-[#3B241B]">
                − {formatMoney(recon.pending_payout_cents, currency)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="text-sm font-bold text-[#3B241B]">
                Unreconciled balance
              </dt>
              <dd className="text-lg font-bold text-[#B75D32]">
                {formatMoney(recon.unreconciled_cents, currency)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Ledger */}
      <div className="rounded-2xl border border-[#FFD9B3] bg-white p-5">
        <h2 className="mb-4 text-base font-bold text-[#3B241B]">
          Transactions
        </h2>
        {ledger.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-[#B8A99D]">
            No transactions yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#FFE9D6] text-xs uppercase tracking-wide text-[#7A6254]">
                  <th className="py-2 pr-3 font-semibold">Date</th>
                  <th className="py-2 pr-3 font-semibold">Type</th>
                  <th className="py-2 pr-3 font-semibold">Customer</th>
                  <th className="py-2 pr-3 text-right font-semibold">Gross</th>
                  <th className="py-2 pr-3 text-right font-semibold">
                    Commission
                  </th>
                  <th className="py-2 pr-3 text-right font-semibold">Net</th>
                  <th className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#FFF6EC] text-[#3B241B]"
                  >
                    <td className="py-2.5 pr-3 text-[#7A6254]">
                      {String(row.created_at).slice(0, 10)}
                    </td>
                    <td className="py-2.5 pr-3">
                      {LEDGER_TYPE_LABEL[row.type] || row.type || "—"}
                    </td>
                    <td className="py-2.5 pr-3">{row.counterpart || "—"}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {formatMoney(row.gross_cents, currency)}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-[#7A6254]">
                      {formatMoney(row.commission_cents, currency)}
                    </td>
                    <td
                      className={`py-2.5 pr-3 text-right font-semibold tabular-nums ${
                        row.net_cents < 0 ? "text-[#B23A2E]" : ""
                      }`}
                    >
                      {formatMoney(row.net_cents, currency)}
                    </td>
                    <td className="py-2.5">
                      <StatusPill status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
