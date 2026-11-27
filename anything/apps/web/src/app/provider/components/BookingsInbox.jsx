import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { useNavigate, Link } from "react-router";
import {
  Check,
  X,
  Ban,
  UserPlus,
  Calendar,
  CalendarDays,
  Loader2,
  Stethoscope,
  Video,
  PhoneOff,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  useProviderBookings,
  useBookingAction,
  useProviderStaff,
  useEndTelehealthConsult,
  useProvider,
} from "../hooks/useProviders";
import { COLORS } from "../lib/colors";
import { formatBookingWhen } from "../lib/bookingTime";
import { bookingActions } from "../lib/bookingActions";
import bookingsCopy from "../i18n/bookings";
import { useProviderCopy } from "../i18n/lib/useProviderCopy";
import { fill } from "../i18n/lib/format";
import { bookingStatusName, roleName } from "../i18n/lib/labels";
import { serverErrorMessage } from "../i18n/lib/serverError";

// Display name for a staff member, falling back to username then a raw id.
function staffName(member, fallbackId, t) {
  return (
    member?.full_name || member?.username || fill(t.staffFallback, { id: fallbackId })
  );
}

// booking_status filter options. "all" sends no ?booking_status (full inbox).
const STATUS_FILTERS = [
  "all",
  "requested",
  "confirmed",
  "completed",
  "declined",
  "cancelled",
];

// Client-side sort of the (unpaginated) inbox. Default matches the server's
// appointment_date DESC ordering; "created" reveals newest-booked first.
const SORT_OPTIONS = ["appointment", "created"];

const BADGE_STYLES = {
  requested: { bg: "#FFF1E2", fg: "#B75D32" },
  confirmed: { bg: "#E5F4EC", fg: "#1F7A4D" },
  completed: { bg: "#EAF0F6", fg: "#33587A" },
  declined: { bg: "#FBE6E4", fg: "#B23B30" },
  cancelled: { bg: "#EFEAE6", fg: "#7A6254" },
};

function StatusBadge({ status, lang }) {
  const s = BADGE_STYLES[status] || { bg: "#EFEAE6", fg: "#7A6254" };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold${
        lang === "en" ? " capitalize" : ""
      }`}
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {status ? bookingStatusName(status, lang) : "—"}
    </span>
  );
}

// Sort keys — both descending (newest first). Slicing keeps the compare stable
// whether appointment_date arrives as "2026-08-15" or a full ISO timestamp.
function apptSortKey(b) {
  return `${String(b.appointment_date ?? "").slice(0, 10)}T${String(
    b.appointment_time ?? "",
  ).slice(0, 5)}`;
}
function createdSortKey(b) {
  return String(b.created_at ?? "");
}

// Free-text haystack for the search box: booking context + the booking number
// (both "#3" and "3" so either query form matches).
function searchHaystack(b) {
  return [
    b.pet_name,
    b.owner_name,
    b.service_name,
    b.notes,
    b.capability,
    `#${b.id}`,
    String(b.id),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const columnHelper = createColumnHelper();

export default function BookingsInbox({ providerId }) {
  const { t, lang } = useProviderCopy(bookingsCopy);
  const errorText = (err, fallback) =>
    serverErrorMessage(err, lang, fallback, bookingsCopy);
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("appointment");
  const bookingStatus = statusFilter === "all" ? undefined : statusFilter;

  const {
    data: bookings,
    isLoading,
    isError,
    error,
  } = useProviderBookings(providerId, bookingStatus);

  // The provider's IANA zone (providers.time_zone) so a booking's `start_at`
  // renders in the provider's own wall-clock — same source ProviderAvailability uses.
  const { data: providerData } = useProvider(providerId);
  const timeZone = providerData?.provider?.time_zone;

  // Search + sort are CLIENT-side: the inbox loads unpaginated, so no API change
  // is needed. Status filtering stays server-side (a query param) as before.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? (bookings ?? []).filter((b) => searchHaystack(b).includes(q))
      : bookings ?? [];
    const keyOf = sortBy === "created" ? createdSortKey : apptSortKey;
    return [...filtered].sort((a, b) => keyOf(b).localeCompare(keyOf(a)));
  }, [bookings, search, sortBy]);

  const { mutate, isPending, variables } = useBookingAction(providerId);
  const { mutate: endConsult, isPending: isEnding, variables: endingVars } =
    useEndTelehealthConsult(providerId);

  // Staff (c2c) powers the Assign-by-name picker and maps a booking's
  // staff_user_id (a provider_staff.user_profile_id) to a display name. Only
  // ACTIVE members can be assigned (the backend rejects non-active ids).
  const { data: staff } = useProviderStaff(providerId);
  const staffById = useMemo(() => {
    const map = new Map();
    for (const m of staff ?? []) map.set(String(m.user_profile_id), m);
    return map;
  }, [staff]);
  const activeStaff = useMemo(
    () => (staff ?? []).filter((m) => m.status === "active"),
    [staff],
  );

  // The booking currently being assigned (opens the staff picker), or null.
  const [assigning, setAssigning] = useState(null);

  // Run an action and toast the outcome. The hook invalidates on success;
  // backend 400/404/409 messages surface (translated in Spanish) so the user sees
  // why, e.g. that only a requested booking can be confirmed.
  const runAction = (appointmentId, action, staffUserId) => {
    mutate(
      { appointmentId, action, staffUserId },
      {
        onSuccess: () => {
          toast.success(t.done[action]);
        },
        onError: (err) => {
          toast.error(errorText(err, t.actionFailed));
        },
      },
    );
  };

  const onConfirm = (b) => runAction(b.id, "confirm");
  const askAbout = (question, b) =>
    window.confirm(fill(question, { pet: b.pet_name || t.thisPet }));
  const onDecline = (b) => {
    if (askAbout(t.prompts.decline, b)) {
      runAction(b.id, "decline");
    }
  };
  const onCancel = (b) => {
    if (askAbout(t.prompts.cancel, b)) {
      runAction(b.id, "cancel");
    }
  };
  // Open the staff picker for this booking; the actual assign fires when a member
  // is chosen (see AssignModal → onPick).
  const onAssign = (b) => setAssigning(b);
  const onPickStaff = (member) => {
    const booking = assigning;
    setAssigning(null);
    if (booking) runAction(booking.id, "assign", member.user_profile_id);
  };

  // Join the video room for a telehealth consult (ticket 2.18). Ensures the session exists
  // (assigned to me), then fetches the join link and opens it. The video vendor is dormant
  // behind keys, so a clean 503 surfaces as a toast — nothing breaks. The clinical note is
  // written via the existing "Open record" path (medical_write), not here.
  const onJoinConsult = async (b) => {
    try {
      const createRes = await fetch(
        `/api/providers/${providerId}/telehealth/sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ booking_id: b.id }),
        },
      );
      if (!createRes.ok) {
        const e = await createRes.json().catch(() => ({}));
        throw new Error(e.error || t.consult.startFailed);
      }
      const { session } = await createRes.json();
      const joinRes = await fetch(
        `/api/providers/${providerId}/telehealth/sessions/${session.id}/join`,
        { method: "POST" },
      );
      if (!joinRes.ok) {
        const e = await joinRes.json().catch(() => ({}));
        throw new Error(e.error || t.consult.joinFailed);
      }
      const { joinUrl } = await joinRes.json();
      if (joinUrl) window.open(joinUrl, "_blank", "noopener");
      else toast.error(t.consult.noLink);
    } catch (err) {
      toast.error(errorText(err, t.consult.joinFailed));
    }
  };

  // End a telehealth consult (the vet's DELIBERATE action — never fires from a closed tab;
  // there's no reliable "the browser tab closed" signal, see telehealth-call.jsx on the owner
  // side, which intentionally does nothing but navigate back on close). Prompts for an
  // optional quick recap the PATCH endpoint already accepts; a cancelled prompt still ends
  // the consult with no summary rather than aborting the action entirely.
  const onEndConsult = (b) => {
    if (!askAbout(t.prompts.endConsult, b)) return;
    const summary = window.prompt(t.prompts.recap, "");
    endConsult(
      { sessionId: b.telehealth_session_id, summary: summary || undefined },
      {
        onSuccess: () => toast.success(t.consult.ended),
        onError: (err) => toast.error(errorText(err, t.consult.endFailed)),
      },
    );
  };

  // Open the booked pet's clinical record (c3). Carry the pet name + booking id so
  // the record screen can label itself and tie an access request to this booking.
  // The record itself is consent-gated server-side — this only navigates.
  const onOpenRecord = (b) => {
    const params = new URLSearchParams();
    if (b.pet_name) params.set("petName", b.pet_name);
    if (b.id != null) params.set("bookingId", String(b.id));
    const qs = params.toString();
    navigate(`/provider/pets/${b.pet_id}/record${qs ? `?${qs}` : ""}`);
  };

  const columns = useMemo(
    () => [
      // The booking number — reuses vet_appointments.id, matching the existing
      // "Booking #<id>" convention (chats, pet record). Visible + searchable.
      columnHelper.accessor((row) => row.id, {
        id: "ref",
        header: t.columns.ref,
        cell: (info) => (
          <span className="whitespace-nowrap font-semibold text-[#7A6254]">
            {`#${info.getValue()}`}
          </span>
        ),
      }),
      // Formatted at render (not as a cached accessor value) so it follows the
      // provider's zone and the language.
      columnHelper.display({
        id: "when",
        header: t.columns.when,
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-medium text-[#3B241B]">
            {formatBookingWhen(row.original, timeZone, lang)}
          </span>
        ),
      }),
      columnHelper.accessor((row) => row.pet_name || "—", {
        id: "pet",
        header: t.columns.pet,
      }),
      columnHelper.accessor((row) => row.owner_name || "—", {
        id: "owner",
        header: t.columns.owner,
      }),
      columnHelper.accessor((row) => row.service_name || "—", {
        id: "service",
        header: t.columns.service,
      }),
      // The owner's free-text note for the visit (replaces the old reason chips on mobile).
      // Truncated with the full text on hover; blank when none so the cell stays quiet.
      columnHelper.accessor((row) => row.notes || "", {
        id: "notes",
        header: t.columns.notes,
        cell: (info) => {
          const v = info.getValue();
          return v ? (
            <span
              className="block max-w-[220px] truncate text-[#7A6254]"
              title={v}
            >
              {v}
            </span>
          ) : null;
        },
      }),
      columnHelper.accessor((row) => row.booking_status, {
        id: "status",
        header: t.columns.status,
        cell: (info) => <StatusBadge status={info.getValue()} lang={lang} />,
      }),
      columnHelper.accessor((row) => row.staff_user_id, {
        id: "assigned",
        header: t.columns.assigned,
        cell: (info) => {
          const v = info.getValue();
          if (v == null)
            return <span className="text-[#B8A99D]">{t.unassigned}</span>;
          return (
            <span className="text-[#3B241B]">
              {staffName(staffById.get(String(v)), v, t)}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: t.columns.actions,
        cell: ({ row }) => {
          const b = row.original;
          // Status-correct action set (shared with the calendar popover in PR-B).
          const {
            canConfirm,
            canDecline,
            canCancel,
            canAssign,
            canOpenRecord,
            canJoinConsult,
            canEndConsult,
          } = bookingActions(b);
          const busy = isPending && variables?.appointmentId === b.id;
          const ending =
            isEnding && endingVars?.sessionId === b.telehealth_session_id;
          return (
            <div className="flex flex-wrap items-center gap-2">
              {canJoinConsult && (
                <ActionButton
                  label={t.actions.join}
                  Icon={Video}
                  onClick={() => onJoinConsult(b)}
                  variant="primary"
                />
              )}
              {canEndConsult && (
                <ActionButton
                  label={t.actions.end}
                  Icon={PhoneOff}
                  onClick={() => onEndConsult(b)}
                  disabled={ending}
                  variant="danger"
                />
              )}
              {canOpenRecord && (
                <ActionButton
                  label={t.actions.openRecord}
                  Icon={Stethoscope}
                  onClick={() => onOpenRecord(b)}
                  variant="muted"
                />
              )}
              {canConfirm && (
                <ActionButton
                  label={t.actions.confirm}
                  Icon={Check}
                  onClick={() => onConfirm(b)}
                  disabled={busy}
                  variant="primary"
                />
              )}
              {canDecline && (
                <ActionButton
                  label={t.actions.decline}
                  Icon={X}
                  onClick={() => onDecline(b)}
                  disabled={busy}
                  variant="danger"
                />
              )}
              {canCancel && (
                <ActionButton
                  label={t.actions.cancel}
                  Icon={Ban}
                  onClick={() => onCancel(b)}
                  disabled={busy}
                  variant="muted"
                />
              )}
              {canAssign && (
                <ActionButton
                  label={t.actions.assign}
                  Icon={UserPlus}
                  onClick={() => onAssign(b)}
                  disabled={busy}
                  variant="muted"
                />
              )}
              {!canConfirm &&
                !canDecline &&
                !canCancel &&
                !canAssign &&
                !canOpenRecord &&
                !canJoinConsult &&
                !canEndConsult && (
                  <span className="text-xs text-[#B8A99D]">{t.actions.none}</span>
                )}
            </div>
          );
        },
      }),
    ],
    // handlers are stable enough for this screen; rebuild on pending change so
    // the busy state reflects in the cells, on staff load so the assigned column
    // resolves names, on timeZone load so the when column re-renders zoned, and on
    // a language change.
    [isPending, variables, isEnding, endingVars, staffById, timeZone, lang],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="px-8 py-7">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: COLORS.peach }}
          >
            <Calendar className="h-5 w-5" style={{ color: COLORS.terracotta }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#3B241B]">{t.title}</h1>
            <p className="text-sm text-[#7A6254]">{t.subtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/provider/calendar"
            className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#FFD9B3] bg-white px-3 py-2 text-sm font-semibold text-[#7A6254]"
          >
            <CalendarDays className="h-4 w-4" />
            {t.calendarView}
          </Link>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B8A99D]" />
            <input
              type="search"
              aria-label={t.searchAria}
              placeholder={t.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 rounded-xl border-2 border-[#FFD9B3] bg-white py-2 pl-9 pr-3 text-sm font-medium text-[#3B241B] outline-none focus:border-[#FF6F61]"
            />
          </div>
          <label htmlFor="booking-sort" className="text-sm font-semibold text-[#7A6254]">
            {t.sortLabel}
          </label>
          <select
            id="booking-sort"
            aria-label={t.sortAria}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-xl border-2 border-[#FFD9B3] bg-white px-3 py-2 text-sm font-semibold text-[#3B241B] outline-none focus:border-[#FF6F61]"
          >
            {SORT_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {t.sort[value]}
              </option>
            ))}
          </select>
          <label
            htmlFor="booking-status-filter"
            className="text-sm font-semibold text-[#7A6254]"
          >
            {t.statusLabel}
          </label>
          <select
            id="booking-status-filter"
            aria-label={t.statusAria}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border-2 border-[#FFD9B3] bg-white px-3 py-2 text-sm font-semibold text-[#3B241B] outline-none focus:border-[#FF6F61]"
          >
            {STATUS_FILTERS.map((value) => (
              <option key={value} value={value}>
                {t.filters[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#FFD9B3] bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 px-6 py-16 text-[#7A6254]">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
            {t.loading}
          </div>
        ) : isError ? (
          <div className="px-6 py-16 text-center">
            <p className="font-semibold text-[#B23B30]">{t.loadError}</p>
            <p className="mt-1 text-sm text-[#7A6254]">
              {errorText(error, t.tryAgain)}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-base font-semibold text-[#3B241B]">
              {search.trim() ? t.noMatchTitle : t.emptyTitle}
            </p>
            <p className="mt-1 text-sm text-[#7A6254]">
              {search.trim() ? t.noMatchBody : t.emptyBody}
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-[#FFF1E2] bg-[#FFFBF6]">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-[#7A6254]"
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[#FFF7EF] last:border-0 hover:bg-[#FFFBF6]"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-middle text-[#3B241B]">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {assigning && (
        <AssignModal
          booking={assigning}
          staff={activeStaff}
          currentStaffId={assigning.staff_user_id}
          onPick={onPickStaff}
          onClose={() => setAssigning(null)}
        />
      )}
    </div>
  );
}

// Picker of ACTIVE staff to assign a booking to. Choosing a member fires the
// assign mutation with that member's user_profile_id; if there are no active
// staff, it points the user at the Staff screen instead of dead-ending.
function AssignModal({ booking, staff, currentStaffId, onPick, onClose }) {
  const { t, lang } = useProviderCopy(bookingsCopy);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.assignModal.aria}
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#3B241B]">
            {fill(t.assignModal.title, {
              name: booking.pet_name || t.assignModal.booking,
            })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.assignModal.close}
            className="rounded-lg p-1.5 text-[#7A6254] hover:bg-[#FFF7EF]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {staff.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#7A6254]">
            {t.assignModal.empty}
          </p>
        ) : (
          <ul className="space-y-2">
            {staff.map((m) => {
              const isCurrent =
                currentStaffId != null &&
                String(currentStaffId) === String(m.user_profile_id);
              return (
                <li key={m.user_profile_id}>
                  <button
                    type="button"
                    onClick={() => onPick(m)}
                    className="flex w-full items-center justify-between rounded-xl border-2 border-[#FFD9B3] bg-[#FFF7EF] px-3 py-2.5 text-left text-sm font-semibold text-[#3B241B] transition-colors hover:border-[#FF6F61]"
                  >
                    <span>
                      {staffName(m, m.user_profile_id, t)}
                      {m.username && (
                        <span className="ml-2 text-xs font-normal text-[#7A6254]">
                          @{m.username}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <span
                        className={`text-xs font-normal text-[#B8A99D]${
                          lang === "en" ? " capitalize" : ""
                        }`}
                      >
                        {roleName(m.role, lang)}
                      </span>
                      {isCurrent && (
                        <span className="rounded-full bg-[#E5F4EC] px-2 py-0.5 text-[10px] font-semibold text-[#1F7A4D]">
                          {t.assignModal.current}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ActionButton({ label, Icon, onClick, disabled, variant }) {
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
      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
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
