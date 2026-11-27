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
import salesCopy from "../i18n/sales";
import { useProviderCopy } from "../i18n/lib/useProviderCopy";
import {
  fill,
  formatDate,
  formatMoney,
  formatMonth,
  formatNumber,
  plural,
} from "../i18n/lib/format";
import { serverErrorMessage } from "../i18n/lib/serverError";

// Provider SALES / PAYOUTS / RECONCILIATION (Wave 7 ticket 2.69). Read-only surfacing of the 2.3
// money already captured: revenue (net/gross over the last 6 months), a transactions ledger
// (payments × orders), payout history + the pending balance, and an aggregate reconciliation that
// ties captured → orders → payouts. NO money is mutated here. Every figure is scoped to the active
// provider; this screen NEVER reads another business's money. Empty data → empty states.

const METRICS = ["net", "gross"];

// The name of a stored value; a value without a name is shown as stored.
const named = (names, value) =>
  Object.hasOwn(names, value) ? names[value] : value;

// The day part of a timestamp: "2026-12-31" (es: "31/12/2026").
function dayOf(value, lang) {
  const day = String(value).slice(0, 10);
  return formatDate(day, lang) || day;
}

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

// `names` is the dictionary group for this kind of status.
function StatusPill({ status, names }) {
  const { lang } = useProviderCopy(salesCopy);
  const tone =
    status === "approved" || status === "paid"
      ? "bg-[#E6F4EC] text-[#2F7D54]"
      : status === "refunded" || status === "failed"
        ? "bg-[#FBE7E4] text-[#B23A2E]"
        : "bg-[#FFF1E2] text-[#B75D32]";
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        lang === "en" ? "capitalize " : ""
      }${tone}`}
    >
      {status ? named(names, status) : "—"}
    </span>
  );
}

export default function ProviderSales({ providerId }) {
  const { t, lang } = useProviderCopy(salesCopy);
  const money = (cents, currency) => formatMoney(cents, currency, lang);
  const monthLabel = (month) => formatMonth(month, lang);
  const numberLabel = (value) =>
    lang === "es" ? formatNumber(value, lang) : value;
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
            {serverErrorMessage(error, lang, t.loadError, salesCopy)}
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
        <h1 className="text-2xl font-bold text-[#3B241B]">{t.title}</h1>
        <p className="text-sm text-[#7A6254]">{t.subtitle}</p>
      </header>

      {/* Payment account connection (ACTION 2 §1) — provider links their own MercadoPago
          account here; without it, checkout stays "payments not configured" for them. */}
      <PaymentAccountCard providerId={providerId} />

      {/* Headline stats */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row">
        <StatCard
          Icon={DollarSign}
          label={t.stats.net}
          value={money(revenue.net_cents, currency)}
          sub={plural(t.stats.paidTransactions, revenue.approved_count ?? 0, lang)}
          accent={COLORS.coral}
        />
        <StatCard
          Icon={TrendingUp}
          label={t.stats.gross}
          value={money(revenue.gross_cents, currency)}
          sub={t.stats.grossSub}
          accent={COLORS.terracotta}
        />
        <StatCard
          Icon={Scissors}
          label={t.stats.commission}
          value={money(revenue.commission_cents, currency)}
          sub={t.stats.commissionSub}
          accent="#9A6CB4"
        />
        <StatCard
          Icon={RefreshCcw}
          label={t.stats.refunds}
          value={money(revenue.refunds_cents, currency)}
          sub={t.stats.refundsSub}
          accent="#B23A2E"
        />
      </div>

      {/* Revenue trend */}
      <div className="mb-6 rounded-2xl border border-[#FFD9B3] bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-[#3B241B]">
            {fill(t.chart.title, { currency })}
          </h2>
          <div className="flex overflow-hidden rounded-lg border border-[#FFD9B3] text-xs font-semibold">
            {METRICS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                className={`px-3 py-1.5 ${lang === "en" ? "capitalize " : ""}${
                  metric === m
                    ? "bg-[#FF6F61] text-white"
                    : "bg-white text-[#7A6254]"
                }`}
              >
                {t.chart[m]}
              </button>
            ))}
          </div>
        </div>
        {revenueSeries.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-[#B8A99D]">
            {t.chart.empty}
          </div>
        ) : (
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={revenueSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#FFE9D6" />
                <XAxis
                  dataKey="month"
                  tickFormatter={monthLabel}
                  tick={{ fontSize: 12, fill: "#7A6254" }}
                />
                <YAxis tickFormatter={numberLabel} tick={{ fontSize: 12, fill: "#7A6254" }} />
                <Tooltip labelFormatter={monthLabel} formatter={numberLabel} />
                <Line
                  type="monotone"
                  dataKey="value"
                  name={t.chart.series}
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
            <h2 className="text-base font-bold text-[#3B241B]">{t.payouts.title}</h2>
          </div>
          <div className="mb-4 flex gap-4">
            <div className="flex-1 rounded-xl bg-[#FFF8F1] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7A6254]">
                {t.payouts.paidOut}
              </p>
              <p className="text-lg font-bold text-[#3B241B]">
                {money(payouts.paid_out_cents, currency)}
              </p>
            </div>
            <div className="flex-1 rounded-xl bg-[#FFF8F1] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7A6254]">
                {t.payouts.pending}
              </p>
              <p className="text-lg font-bold text-[#3B241B]">
                {money(payouts.pending_payout_cents, currency)}
              </p>
            </div>
          </div>
          {payouts.rows.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-[#B8A99D]">
              {t.payouts.empty}
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
                      {money(p.amount_cents, currency)}
                    </p>
                    <p className="text-xs text-[#7A6254]">
                      {dayOf(p.created_at, lang)} ·{" "}
                      {p.rail ? named(t.rails, p.rail) : "—"}
                    </p>
                  </div>
                  <StatusPill status={p.status} names={t.payoutStatus} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-[#FFD9B3] bg-white p-5">
          <h2 className="mb-4 text-base font-bold text-[#3B241B]">
            {t.reconciliation.title}
          </h2>
          <p className="mb-4 text-xs text-[#7A6254]">{t.reconciliation.hint}</p>
          <dl className="divide-y divide-[#FFF1E2]">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-sm text-[#7A6254]">{t.reconciliation.netCaptured}</dt>
              <dd className="font-semibold text-[#3B241B]">
                {money(recon.net_captured_cents, currency)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-sm text-[#7A6254]">{t.reconciliation.paidOut}</dt>
              <dd className="font-semibold text-[#3B241B]">
                − {money(recon.paid_out_cents, currency)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-sm text-[#7A6254]">{t.reconciliation.pendingPayout}</dt>
              <dd className="font-semibold text-[#3B241B]">
                − {money(recon.pending_payout_cents, currency)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="text-sm font-bold text-[#3B241B]">
                {t.reconciliation.unreconciled}
              </dt>
              <dd className="text-lg font-bold text-[#B75D32]">
                {money(recon.unreconciled_cents, currency)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Ledger */}
      <div className="rounded-2xl border border-[#FFD9B3] bg-white p-5">
        <h2 className="mb-4 text-base font-bold text-[#3B241B]">
          {t.ledger.title}
        </h2>
        {ledger.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-[#B8A99D]">
            {t.ledger.empty}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#FFE9D6] text-xs uppercase tracking-wide text-[#7A6254]">
                  <th className="py-2 pr-3 font-semibold">{t.ledger.date}</th>
                  <th className="py-2 pr-3 font-semibold">{t.ledger.type}</th>
                  <th className="py-2 pr-3 font-semibold">{t.ledger.customer}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t.ledger.gross}</th>
                  <th className="py-2 pr-3 text-right font-semibold">
                    {t.ledger.commission}
                  </th>
                  <th className="py-2 pr-3 text-right font-semibold">{t.ledger.net}</th>
                  <th className="py-2 font-semibold">{t.ledger.status}</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#FFF6EC] text-[#3B241B]"
                  >
                    <td className="py-2.5 pr-3 text-[#7A6254]">
                      {dayOf(row.created_at, lang)}
                    </td>
                    <td className="py-2.5 pr-3">
                      {row.type ? named(t.orderKinds, row.type) : "—"}
                    </td>
                    <td className="py-2.5 pr-3">{row.counterpart || "—"}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {money(row.gross_cents, currency)}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-[#7A6254]">
                      {money(row.commission_cents, currency)}
                    </td>
                    <td
                      className={`py-2.5 pr-3 text-right font-semibold tabular-nums ${
                        row.net_cents < 0 ? "text-[#B23A2E]" : ""
                      }`}
                    >
                      {money(row.net_cents, currency)}
                    </td>
                    <td className="py-2.5">
                      <StatusPill status={row.status} names={t.paymentStatus} />
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
