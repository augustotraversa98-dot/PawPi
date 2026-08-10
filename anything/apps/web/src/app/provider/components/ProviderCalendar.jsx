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
  List,
} from "lucide-react";
import { toast } from "sonner";
import {
  useProviderBookingsCalendar,
  useBookingAction,
  useProviderStaff,
  useProvider,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";
import { bookingActions } from "../lib/bookingActions";
import { formatBookingWhen } from "../lib/bookingTime";
import {
  rangeForView,
  viewDays,
  ymd,
  hourLabel,
  dayHeader,
  addDays,
  gridHours,
  layoutDay,
  zonedMinutes,
  HOUR_PX,
} from "../lib/calendar";

// /provider/calendar — a week/day grid of this provider's bookings (ticket 2.24; Phase 3
// proportional layout). Dates are columns, time runs top-to-bottom; each booking is a
// duration-sized block positioned by its start (provider zone), overlaps tiled into lanes.
// Click a booking → a detail popover with the full booking-context info + the existing
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

  // The provider's IANA zone (providers.time_zone) so the popover renders in the
  // provider's own wall-clock — same source the inbox / ProviderAvailability use.
  const { data: providerData } = useProvider(providerId);
  const timeZone = providerData?.provider?.time_zone;

  // Hide declined + cancelled from the grid (they only clutter it and dead-end the
  // popover). Requested + confirmed stay actionable; completed stays as a muted,
  // read-only record. Filtered client-side over the already-fetched window — no API
  // change. (Only-requested+confirmed would just drop "completed" from this list.)
  const visibleBookings = useMemo(
    () =>
      (bookings ?? []).filter(
        (b) =>
          b.booking_status !== "declined" && b.booking_status !== "cancelled",
      ),
    [bookings],
  );

  const days = useMemo(() => viewDays(view, anchor), [view, anchor]);
  // Visible hour band (provider zone), the axis rows, and the grid's pixel height.
  const { startHour, endHour } = useMemo(
    () => gridHours(visibleBookings, timeZone),
    [visibleBookings, timeZone],
  );
  const hours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour],
  );
  const gridStartMin = startHour * 60;
  const gridHeightPx = (endHour - startHour) * HOUR_PX;
  // Group bookings into day columns by their PROVIDER-zone calendar date (so a late/early
  // booking lands in the right column); each column is laid out proportionally below.
  const byDay = useMemo(() => {
    const m = new Map();
    for (const b of visibleBookings) {
      const z = zonedMinutes(b.start_at, timeZone);
      if (!z) continue;
      if (!m.has(z.date)) m.set(z.date, []);
      m.get(z.date).push(b);
    }
    return m;
  }, [visibleBookings, timeZone]);

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
          <div className="min-w-[640px]">
            {/* Day headers, aligned over the columns (left gutter = the time axis). */}
            <div className="flex border-b border-[#FFF1E2] bg-[#FFFBF6]">
              <div className="w-14 flex-shrink-0" />
              {days.map((d) => (
                <div
                  key={ymd(d)}
                  className="flex-1 px-2 py-2 text-center text-xs font-bold uppercase tracking-wide text-[#7A6254]"
                >
                  {dayHeader(d)}
                </div>
              ))}
            </div>

            {/* Proportional grid: a time axis + one relative-positioned column per day. */}
            <div className="flex">
              {/* Time axis — one labeled row per hour. */}
              <div className="w-14 flex-shrink-0" style={{ height: gridHeightPx }}>
                {hours.map((h) => (
                  <div
                    key={h}
                    className="relative border-t border-[#FFF1E2]"
                    style={{ height: HOUR_PX }}
                  >
                    <span className="absolute right-1.5 top-0.5 text-[10px] text-[#B8A99D]">
                      {hourLabel(h)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Day columns — each booking is a duration-sized, absolutely-placed block. */}
              {days.map((d) => {
                const items = layoutDay(
                  byDay.get(ymd(d)) ?? [],
                  gridStartMin,
                  timeZone,
                );
                return (
                  <div
                    key={ymd(d)}
                    className="relative flex-1 border-l border-[#FFF7EF]"
                    style={{ height: gridHeightPx }}
                  >
                    {/* Hour gridlines. */}
                    {hours.map((h, i) => (
                      <div
                        key={h}
                        className="absolute inset-x-0 border-t border-[#FFF7EF]"
                        style={{ top: i * HOUR_PX }}
                      />
                    ))}
                    {/* Duration-sized booking blocks. */}
                    {items.map((it) => (
                      <BookingBlock
                        key={it.booking.id}
                        item={it}
                        onClick={() => setSelected(it.booking)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {visibleBookings.length === 0 && (
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
          timeZone={timeZone}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// One proportional booking block: absolutely positioned by wall-clock start, sized by
// duration, placed into an overlap lane (left/width from lane/laneCount). Content scales
// to the block — the time range always; the pet on a normal block; the service on a
// taller one. A completed booking is muted; full detail is in the popover on click.
function BookingBlock({ item, onClick }) {
  const b = item.booking;
  const color = STATUS_COLOR[b.booking_status] || "#7A6254";
  const isMuted = b.booking_status === "completed";
  const showPet = item.height >= 24;
  const showService = item.height >= 46;
  const widthPct = 100 / item.laneCount;
  const leftPct = item.lane * widthPct;
  return (
    <button
      type="button"
      data-testid="calendar-booking"
      onClick={onClick}
      title={`${item.timeLabel} · ${b.pet_name || "Booking"}`}
      className={`absolute overflow-hidden rounded-md border-l-4 bg-[#FFF7EF] px-1.5 py-0.5 text-left leading-tight${
        isMuted ? " opacity-70" : ""
      }`}
      style={{
        top: item.top,
        height: item.height,
        left: `${leftPct}%`,
        width: `calc(${widthPct}% - 3px)`,
        borderColor: color,
      }}
    >
      <span className="flex items-center gap-1 truncate text-[10px] font-semibold text-[#7A6254]">
        <span
          className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: b.paid ? "#1F7A4D" : "#D9A441" }}
          title={b.paid ? "Paid" : "Unpaid"}
        />
        {item.timeLabel}
      </span>
      {showPet && (
        <span className="block truncate text-xs font-semibold text-[#3B241B]">
          {b.pet_name || "Booking"}
        </span>
      )}
      {showService && (
        <span className="block truncate text-[11px] text-[#7A6254]">
          {b.service_name || b.capability || "—"}
        </span>
      )}
    </button>
  );
}

function BookingDetail({ providerId, booking: b, timeZone, onClose }) {
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
  // Shared per-status gating (same rules as the bookings inbox). The calendar
  // popover only wires confirm/decline/cancel/assign — telehealth Join/End consult
  // live in the inbox — so it reads just those flags. A completed booking yields
  // none, leaving a graceful read-only view (the details below).
  const { canConfirm, canDecline, canCancel, canAssign } = bookingActions(b);
  const value = money(b.value_cents, b.value_currency);
  // Provider-zone wall-clock (was the browser zone via toLocaleString).
  const when = formatBookingWhen(b, timeZone);

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
            <p className="text-xs font-semibold text-[#B8A99D]">{`#${b.id}`}</p>
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
            {/* Declined/cancelled never reach the grid; a completed booking is a
                read-only record (the details above ARE the view), so it shows a
                muted note rather than the old "No actions available" dead-end. */}
            {!canConfirm && !canDecline && !canCancel && !canAssign && (
              <span className="text-xs text-[#B8A99D]">Read-only booking</span>
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
