import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  Check,
  Ban,
  UserPlus,
  MapPin,
  Home,
  List,
} from "lucide-react";
import { toast } from "sonner";
import {
  useProviderBookingsCalendar,
  useBookingAction,
  useProviderStaff,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";
import {
  rangeForView,
  viewDays,
  hourRange,
  indexByCell,
  ymd,
  hourLabel,
  dayHeader,
  addDays,
} from "../lib/calendar";

// /provider/calendar — a week/day grid of this provider's bookings (ticket 2.24).
// Dates are columns, times are rows; each booking sits in its start-hour cell. Click a
// booking → a detail popover with the full booking-context info + the existing
// confirm/decline/cancel/assign actions (reused from the inbox hook). Scoped to the
// ACTIVE provider only. NO medical data is read on this path.
function money(cents, currency = "ARS") {
  if (cents == null) return null;
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

const STATUS_COLOR = {
  requested: "#B75D32",
  confirmed: "#1F7A4D",
  declined: "#B23B30",
  cancelled: "#7A6254",
};

export default function ProviderCalendar({ providerId, initialAnchor }) {
  const [view, setView] = useState("week");
  const [anchor, setAnchor] = useState(() => initialAnchor ?? new Date());
  const [selected, setSelected] = useState(null);

  const { from, to } = useMemo(() => rangeForView(view, anchor), [view, anchor]);
  const { data: bookings, isLoading, isError, error } =
    useProviderBookingsCalendar(providerId, from, to);

  const days = useMemo(() => viewDays(view, anchor), [view, anchor]);
  const rows = useMemo(() => hourRange(bookings ?? []), [bookings]);
  const cells = useMemo(() => indexByCell(bookings ?? []), [bookings]);

  const shift = (dir) =>
    setAnchor((a) => addDays(a, dir * (view === "day" ? 1 : 7)));

  const rangeLabel =
    view === "day"
      ? days[0].toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        })
      : `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[
          days.length - 1
        ].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  return (
    <div className="px-8 py-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#3B241B]">Calendar</h1>
          <p className="text-sm text-[#7A6254]">{rangeLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/provider/bookings"
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[#FFD9B3] bg-white px-3 py-1.5 text-sm font-semibold text-[#7A6254]"
          >
            <List className="h-4 w-4" />
            List view
          </Link>
          <div className="flex overflow-hidden rounded-xl border-2 border-[#FFD9B3]">
            {["week", "day"].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className="px-3 py-1.5 text-sm font-semibold capitalize"
                style={
                  view === v
                    ? { backgroundColor: COLORS.coral, color: "#fff" }
                    : { backgroundColor: "#fff", color: "#7A6254" }
                }
              >
                {v}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Previous"
            onClick={() => shift(-1)}
            className="rounded-lg border-2 border-[#FFD9B3] bg-white p-1.5 text-[#7A6254]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setAnchor(new Date())}
            className="rounded-lg border-2 border-[#FFD9B3] bg-white px-3 py-1.5 text-sm font-semibold text-[#7A6254]"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => shift(1)}
            className="rounded-lg border-2 border-[#FFD9B3] bg-white p-1.5 text-[#7A6254]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#FFD9B3] bg-white px-6 py-16 text-[#7A6254]">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
          Loading calendar…
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-[#FFD9B3] bg-white px-6 py-16 text-center">
          <p className="font-semibold text-[#B23B30]">Couldn't load the calendar</p>
          <p className="mt-1 text-sm text-[#7A6254]">
            {error?.message || "Please try again."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#FFD9B3] bg-white">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#FFF1E2] bg-[#FFFBF6]">
                <th className="w-16 px-2 py-2 text-[#7A6254]" />
                {days.map((d) => (
                  <th
                    key={ymd(d)}
                    className="px-2 py-2 text-center text-xs font-bold uppercase tracking-wide text-[#7A6254]"
                  >
                    {dayHeader(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h} className="border-b border-[#FFF7EF] last:border-0">
                  <td className="px-2 py-2 align-top text-[#B8A99D]">
                    {hourLabel(h)}
                  </td>
                  {days.map((d) => {
                    const list = cells.get(`${ymd(d)}|${h}`) ?? [];
                    return (
                      <td
                        key={`${ymd(d)}-${h}`}
                        className="min-w-[120px] border-l border-[#FFF7EF] px-1.5 py-1.5 align-top"
                      >
                        <div className="space-y-1">
                          {list.map((b) => (
                            <BookingChip
                              key={b.id}
                              booking={b}
                              onClick={() => setSelected(b)}
                            />
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {(bookings ?? []).length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-semibold text-[#3B241B]">
                No bookings this {view}
              </p>
              <p className="mt-1 text-sm text-[#7A6254]">
                Bookings owners make will appear on the grid.
              </p>
            </div>
          )}
        </div>
      )}

      {selected && (
        <BookingDetail
          providerId={providerId}
          booking={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function BookingChip({ booking: b, onClick }) {
  const color = STATUS_COLOR[b.booking_status] || "#7A6254";
  return (
    <button
      type="button"
      data-testid="calendar-booking"
      onClick={onClick}
      className="block w-full rounded-lg border-l-4 bg-[#FFF7EF] px-2 py-1 text-left"
      style={{ borderColor: color }}
    >
      <span className="block truncate font-semibold text-[#3B241B]">
        {b.pet_name || "Booking"}
      </span>
      <span className="block truncate text-[#7A6254]">
        {b.service_name || b.capability || "—"}
      </span>
      <span className="mt-0.5 flex items-center gap-1 text-[10px] text-[#7A6254]">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: b.paid ? "#1F7A4D" : "#D9A441" }}
          title={b.paid ? "Paid" : "Unpaid"}
        />
        {b.location_name ? (
          <MapPin className="h-3 w-3" />
        ) : (
          <Home className="h-3 w-3" />
        )}
      </span>
    </button>
  );
}

function BookingDetail({ providerId, booking: b, onClose }) {
  const { mutate, isPending } = useBookingAction(providerId);
  const { data: staff } = useProviderStaff(providerId);
  const activeStaff = (staff ?? []).filter((m) => m.status === "active");
  const [assignOpen, setAssignOpen] = useState(false);

  const run = (action, staffUserId) =>
    mutate(
      { appointmentId: b.id, action, staffUserId },
      {
        onSuccess: () => {
          toast.success(
            `Booking ${
              { confirm: "confirmed", decline: "declined", cancel: "cancelled", assign: "assigned" }[
                action
              ]
            }`,
          );
          onClose();
        },
        onError: (err) => toast.error(err?.message || "Action failed"),
      },
    );

  const status = b.booking_status;
  const canConfirm = status === "requested";
  const canDecline = status === "requested";
  const canCancel = status === "requested" || status === "confirmed";
  const canAssign = status === "requested" || status === "confirmed";
  const value = money(b.value_cents, b.value_currency);
  const when = b.start_at
    ? new Date(b.start_at).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : `${b.appointment_date ?? ""} ${b.appointment_time ?? ""}`.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Booking details"
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#3B241B]">
              {b.pet_name || "Booking"}
            </h2>
            <p className="text-sm text-[#7A6254]">{when}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-[#7A6254] hover:bg-[#FFF7EF]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <dl className="space-y-1.5 text-sm">
          <Row label="Owner" value={b.owner_name} />
          <Row label="Service" value={b.service_name || b.capability} />
          <Row
            label="Pet"
            value={[b.pet_species, b.pet_breed].filter(Boolean).join(" · ")}
          />
          <Row
            label="Location"
            value={
              b.location_name
                ? `${b.location_name}${b.location_address ? ` — ${b.location_address}` : ""}`
                : "House visit"
            }
          />
          <Row label="Status" value={status} />
          <Row
            label="Payment"
            value={value ? `${value} · ${b.paid ? "Paid" : "Unpaid"}` : "—"}
          />
          {b.notes ? <Row label="Notes" value={b.notes} /> : null}
        </dl>

        {assignOpen ? (
          <div className="mt-4 rounded-xl border-2 border-[#FFD9B3] p-3">
            <p className="mb-2 text-sm font-semibold text-[#3B241B]">Assign to</p>
            {activeStaff.length === 0 ? (
              <p className="text-sm text-[#7A6254]">No active staff to assign.</p>
            ) : (
              <ul className="space-y-1.5">
                {activeStaff.map((m) => (
                  <li key={m.user_profile_id}>
                    <button
                      type="button"
                      onClick={() => run("assign", m.user_profile_id)}
                      className="w-full rounded-lg border border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2 text-left text-sm font-semibold text-[#3B241B]"
                    >
                      {m.full_name || m.username || `Staff #${m.user_profile_id}`}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap gap-2">
            {canConfirm && (
              <Action label="Confirm" Icon={Check} variant="primary" disabled={isPending} onClick={() => run("confirm")} />
            )}
            {canDecline && (
              <Action label="Decline" Icon={X} variant="danger" disabled={isPending} onClick={() => run("decline")} />
            )}
            {canCancel && (
              <Action label="Cancel" Icon={Ban} variant="muted" disabled={isPending} onClick={() => run("cancel")} />
            )}
            {canAssign && (
              <Action label="Assign" Icon={UserPlus} variant="muted" disabled={isPending} onClick={() => setAssignOpen(true)} />
            )}
            {!canConfirm && !canDecline && !canCancel && !canAssign && (
              <span className="text-xs text-[#B8A99D]">No actions available</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[#7A6254]">{label}</dt>
      <dd className="text-right font-medium text-[#3B241B]">{value}</dd>
    </div>
  );
}

function Action({ label, Icon, variant, onClick, disabled }) {
  const styles = {
    primary: { backgroundColor: COLORS.coral, color: "#fff", border: "transparent" },
    danger: { backgroundColor: "#FBE6E4", color: "#B23B30", border: "#F3C9C4" },
    muted: { backgroundColor: "#FFF7EF", color: "#7A6254", border: "#FFD9B3" },
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
      style={{
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        borderColor: styles.border,
      }}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
