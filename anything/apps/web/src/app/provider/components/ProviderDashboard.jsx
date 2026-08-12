import { useMemo } from "react";
import { useNavigate } from "react-router";
import {
  DollarSign,
  CalendarCheck,
  Home,
  Star,
  Loader2,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "../../../client-integrations/recharts";
import { useProviderAnalytics } from "../hooks/useProviders";
import { COLORS } from "../lib/colors";
import GettingStartedChecklist from "./GettingStartedChecklist";

// Provider DASHBOARD HOME — the at-a-glance business overview (Phase 2 ticket 2.14). Reads the
// /analytics summary, which aggregates ONLY this provider's own rows (revenue, bookings,
// occupancy, rating, top services). recharts (an existing web dep) renders the revenue +
// bookings trends + the top-services bars. Every value is scoped to the active provider; this
// screen NEVER reads another business's data. Empty data → empty states (no fake metrics).

// Format integer cents in the provider's currency (e.g. "ARS 1,250.00"). The analytics summary
// reports a single de-facto currency; the chart axis stays cents-free by labeling the card.
function formatMoney(cents, currency) {
  const v = (Number(cents) || 0) / 100;
  return `${currency || "ARS"} ${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatWhen(date, time) {
  if (!date) return "—";
  const t = time ? String(time).slice(0, 5) : "";
  return t ? `${date} · ${t}` : date;
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

function ChartCard({ title, children, empty, emptyText }) {
  return (
    <div className="rounded-2xl border border-[#FFD9B3] bg-white p-5">
      <h2 className="mb-4 text-base font-bold text-[#3B241B]">{title}</h2>
      {empty ? (
        <div className="flex h-48 items-center justify-center text-sm text-[#B8A99D]">
          {emptyText}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export default function ProviderDashboard({ providerId }) {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useProviderAnalytics(providerId);

  // recharts wants display dollars on the revenue axis; map cents → number once.
  const revenueSeries = useMemo(
    () =>
      (data?.revenue?.by_month ?? []).map((m) => ({
        month: m.month,
        revenue: Math.round((Number(m.revenue_cents) || 0) / 100),
      })),
    [data],
  );
  const bookingsSeries = data?.bookings?.by_month ?? [];
  const topServices = data?.top_services ?? [];
  const upcoming = data?.bookings?.upcoming ?? [];

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
            {error?.message || "Couldn't load your dashboard."}
          </p>
        </div>
      </div>
    );
  }

  const currency = data?.revenue?.currency ?? "ARS";
  const avgRating = data?.rating?.avg_rating ?? 0;
  const reviewCount = data?.rating?.review_count ?? 0;

  return (
    <div className="p-6">
      {/* Getting-started activation checklist (ticket 2.99) — retires itself at 100%. */}
      <GettingStartedChecklist providerId={providerId} />

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[#3B241B]">Dashboard</h1>
        <p className="text-sm text-[#7A6254]">
          Your business at a glance — only this provider's data.
        </p>
      </header>

      {/* Headline stats */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row">
        <StatCard
          Icon={DollarSign}
          label="Revenue (paid)"
          value={formatMoney(data?.revenue?.total_cents, currency)}
          sub={`${data?.revenue?.paid_order_count ?? 0} paid orders`}
          accent={COLORS.coral}
        />
        <StatCard
          Icon={CalendarCheck}
          label="Bookings"
          value={data?.bookings?.total ?? 0}
          sub={`${data?.bookings?.upcoming_count ?? 0} upcoming`}
          accent={COLORS.terracotta}
        />
        <StatCard
          Icon={Home}
          label="Occupancy"
          value={data?.occupancy?.on_site ?? 0}
          sub={`${data?.occupancy?.booked_ahead ?? 0} booked ahead`}
          accent="#5A8A74"
        />
        <StatCard
          Icon={Star}
          label="Avg rating"
          value={reviewCount > 0 ? Number(avgRating).toFixed(2) : "—"}
          sub={`${reviewCount} review${reviewCount === 1 ? "" : "s"}`}
          accent="#E0A800"
        />
      </div>

      {/* Trends */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title={`Revenue by month (${currency})`}
          empty={revenueSeries.length === 0}
          emptyText="No paid orders yet."
        >
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={revenueSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#FFE9D6" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#7A6254" }} />
                <YAxis tick={{ fontSize: 12, fill: "#7A6254" }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke={COLORS.coral}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Bookings by month"
          empty={bookingsSeries.length === 0}
          emptyText="No bookings yet."
        >
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={bookingsSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#FFE9D6" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#7A6254" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#7A6254" }} />
                <Tooltip />
                <Bar dataKey="booking_count" fill={COLORS.terracotta} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Top services + upcoming */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Top services"
          empty={topServices.length === 0}
          emptyText="No service bookings yet."
        >
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={topServices} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#FFE9D6" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: "#7A6254" }}
                />
                <YAxis
                  type="category"
                  dataKey="service_name"
                  width={120}
                  tick={{ fontSize: 12, fill: "#7A6254" }}
                />
                <Tooltip />
                <Bar dataKey="booking_count" fill={COLORS.coral} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <div className="rounded-2xl border border-[#FFD9B3] bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-[#3B241B]">Upcoming bookings</h2>
            <button
              type="button"
              onClick={() => navigate("/provider/bookings")}
              className="flex items-center gap-1 text-sm font-semibold text-[#B75D32] hover:underline"
            >
              <TrendingUp className="h-4 w-4" /> Inbox
            </button>
          </div>
          {upcoming.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-[#B8A99D]">
              No upcoming bookings.
            </div>
          ) : (
            <ul className="divide-y divide-[#FFF1E2]">
              {upcoming.map((b) => (
                <li key={b.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-semibold text-[#3B241B]">
                      {b.pet_name || "Pet"}
                      {b.owner_name ? (
                        <span className="font-normal text-[#7A6254]">
                          {" "}
                          · {b.owner_name}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-[#7A6254]">
                      {b.service_name || b.capability || "Booking"} ·{" "}
                      {formatWhen(b.appointment_date, b.appointment_time)}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#FFF1E2] px-2.5 py-1 text-xs font-semibold capitalize text-[#B75D32]">
                    {b.booking_status || "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
