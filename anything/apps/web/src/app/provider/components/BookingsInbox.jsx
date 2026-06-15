import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { Check, X, Ban, UserPlus, Calendar, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useProviderBookings, useBookingAction } from "../hooks/useProviders";
import { COLORS } from "../lib/colors";

// booking_status filter options. "all" sends no ?booking_status (full inbox).
const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "requested", label: "Requested" },
  { value: "confirmed", label: "Confirmed" },
  { value: "declined", label: "Declined" },
  { value: "cancelled", label: "Cancelled" },
];

const BADGE_STYLES = {
  requested: { bg: "#FFF1E2", fg: "#B75D32" },
  confirmed: { bg: "#E5F4EC", fg: "#1F7A4D" },
  declined: { bg: "#FBE6E4", fg: "#B23B30" },
  cancelled: { bg: "#EFEAE6", fg: "#7A6254" },
};

function StatusBadge({ status }) {
  const s = BADGE_STYLES[status] || { bg: "#EFEAE6", fg: "#7A6254" };
  return (
    <span
      className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold capitalize"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {status || "—"}
    </span>
  );
}

function formatWhen(date, time) {
  if (!date) return "—";
  // time may be HH:MM or HH:MM:SS; keep HH:MM for display.
  const t = time ? String(time).slice(0, 5) : "";
  return t ? `${date} · ${t}` : date;
}

const columnHelper = createColumnHelper();

export default function BookingsInbox({ providerId }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const bookingStatus = statusFilter === "all" ? undefined : statusFilter;

  const {
    data: bookings,
    isLoading,
    isError,
    error,
  } = useProviderBookings(providerId, bookingStatus);

  const { mutate, isPending, variables } = useBookingAction(providerId);

  // Run an action and toast the outcome. The hook invalidates on success;
  // backend 400/404/409 messages surface verbatim so the user sees e.g.
  // "Only a requested booking can be confirmed".
  const runAction = (appointmentId, action, staffUserId) => {
    mutate(
      { appointmentId, action, staffUserId },
      {
        onSuccess: () => {
          const verb = {
            confirm: "confirmed",
            decline: "declined",
            cancel: "cancelled",
            assign: "assigned",
          }[action];
          toast.success(`Booking ${verb}`);
        },
        onError: (err) => {
          toast.error(err?.message || "Action failed");
        },
      },
    );
  };

  const onConfirm = (b) => runAction(b.id, "confirm");
  const onDecline = (b) => {
    if (window.confirm(`Decline the booking for ${b.pet_name || "this pet"}?`)) {
      runAction(b.id, "decline");
    }
  };
  const onCancel = (b) => {
    if (window.confirm(`Cancel the booking for ${b.pet_name || "this pet"}?`)) {
      runAction(b.id, "cancel");
    }
  };
  const onAssign = (b) => {
    // Minimal staff picker (a full picker waits for the Staff c-ticket): prompt
    // for a staff user id. Must be a number — the backend rejects non-active ids.
    const raw = window.prompt(
      "Assign to staff — enter the staff member's user id:",
      b.staff_user_id != null ? String(b.staff_user_id) : "",
    );
    if (raw == null) return; // cancelled
    const staffUserId = Number(raw.trim());
    if (!raw.trim() || Number.isNaN(staffUserId)) {
      toast.error("Enter a valid staff user id");
      return;
    }
    runAction(b.id, "assign", staffUserId);
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => formatWhen(row.appointment_date, row.appointment_time), {
        id: "when",
        header: "Date & time",
        cell: (info) => (
          <span className="font-medium text-[#3B241B]">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor((row) => row.pet_name || "—", {
        id: "pet",
        header: "Pet",
      }),
      columnHelper.accessor((row) => row.owner_name || "—", {
        id: "owner",
        header: "Owner",
      }),
      columnHelper.accessor((row) => row.service_name || "—", {
        id: "service",
        header: "Service",
      }),
      columnHelper.accessor((row) => row.booking_status, {
        id: "status",
        header: "Status",
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
      columnHelper.accessor((row) => row.staff_user_id, {
        id: "assigned",
        header: "Assigned",
        cell: (info) => {
          const v = info.getValue();
          return v != null ? (
            <span className="text-[#3B241B]">Staff #{v}</span>
          ) : (
            <span className="text-[#B8A99D]">Unassigned</span>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const b = row.original;
          const status = b.booking_status;
          const canConfirm = status === "requested";
          const canDecline = status === "requested";
          const canCancel = status === "requested" || status === "confirmed";
          const canAssign = status === "requested" || status === "confirmed";
          const busy = isPending && variables?.appointmentId === b.id;
          return (
            <div className="flex flex-wrap items-center gap-2">
              {canConfirm && (
                <ActionButton
                  label="Confirm"
                  Icon={Check}
                  onClick={() => onConfirm(b)}
                  disabled={busy}
                  variant="primary"
                />
              )}
              {canDecline && (
                <ActionButton
                  label="Decline"
                  Icon={X}
                  onClick={() => onDecline(b)}
                  disabled={busy}
                  variant="danger"
                />
              )}
              {canCancel && (
                <ActionButton
                  label="Cancel"
                  Icon={Ban}
                  onClick={() => onCancel(b)}
                  disabled={busy}
                  variant="muted"
                />
              )}
              {canAssign && (
                <ActionButton
                  label="Assign"
                  Icon={UserPlus}
                  onClick={() => onAssign(b)}
                  disabled={busy}
                  variant="muted"
                />
              )}
              {!canConfirm && !canDecline && !canCancel && !canAssign && (
                <span className="text-xs text-[#B8A99D]">No actions</span>
              )}
            </div>
          );
        },
      }),
    ],
    // handlers are stable enough for this screen; rebuild on pending change so
    // the busy state reflects in the cells.
    [isPending, variables],
  );

  const table = useReactTable({
    data: bookings ?? [],
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
            <h1 className="text-2xl font-bold text-[#3B241B]">Bookings</h1>
            <p className="text-sm text-[#7A6254]">
              Incoming appointments from pet owners
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="booking-status-filter"
            className="text-sm font-semibold text-[#7A6254]"
          >
            Status
          </label>
          <select
            id="booking-status-filter"
            aria-label="Filter by booking status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border-2 border-[#FFD9B3] bg-white px-3 py-2 text-sm font-semibold text-[#3B241B] outline-none focus:border-[#FF6F61]"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#FFD9B3] bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 px-6 py-16 text-[#7A6254]">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: COLORS.coral }} />
            Loading bookings…
          </div>
        ) : isError ? (
          <div className="px-6 py-16 text-center">
            <p className="font-semibold text-[#B23B30]">
              Couldn't load bookings
            </p>
            <p className="mt-1 text-sm text-[#7A6254]">
              {error?.message || "Please try again."}
            </p>
          </div>
        ) : (bookings ?? []).length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-base font-semibold text-[#3B241B]">
              No bookings yet
            </p>
            <p className="mt-1 text-sm text-[#7A6254]">
              When a pet owner books with you, it will appear here.
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
