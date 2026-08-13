// Which actions may render for a booking, given its booking_status + (for telehealth) its
// session state. PURE — no mutations here; the caller wires the confirm/decline/cancel/assign
// handlers. This is a faithful port of the web dashboard's provider/lib/bookingActions.js so the
// mobile Business → Bookings agenda applies EXACTLY the same rules as the web BookingsInbox.
//
// Rules:
//   requested  → Confirm, Decline, Assign
//   confirmed  → Cancel, Assign; Join consult (telehealth);
//                End consult ONLY while the telehealth session is in_progress
//   declined / cancelled / completed → no state-changing or consult actions
//
// A still-requested booking is DECLINED, not cancelled — so Cancel is a confirmed-only action.
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

export default bookingActions;
