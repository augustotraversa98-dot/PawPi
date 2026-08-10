// Which actions may render for a booking, given its booking_status + (for
// telehealth) its session state. PURE — no mutations here; the caller wires the
// confirm/decline/cancel/assign/consult handlers. Shared so the bookings inbox and
// (PR-B) the calendar detail popover apply exactly the same rules.
//
// Rules:
//   requested  → Confirm, Decline, Assign, Open record
//   confirmed  → Cancel, Assign, Open record; Join consult (telehealth);
//                End consult ONLY while the telehealth session is in_progress
//   declined / cancelled / completed → no state-changing or consult actions
//                (Open record may still show when the booking has a pet)
//
// A still-requested booking is DECLINED, not cancelled — so Cancel is a
// confirmed-only action. End/Join consult require the booking to be confirmed:
// there is nothing to join or end on a request that was never accepted, nor on a
// declined/cancelled/completed one.
export function bookingActions(row) {
  const status = row?.booking_status;
  const isTelehealth = row?.capability === "telehealth";
  return {
    canConfirm: status === "requested",
    canDecline: status === "requested",
    canCancel: status === "confirmed",
    canAssign: status === "requested" || status === "confirmed",
    canOpenRecord: row?.pet_id != null,
    canJoinConsult: isTelehealth && status === "confirmed",
    canEndConsult:
      isTelehealth &&
      status === "confirmed" &&
      row?.telehealth_session_id != null &&
      row?.telehealth_session_status === "in_progress",
  };
}
