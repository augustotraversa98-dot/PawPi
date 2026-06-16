// calendarSync — the STUBBED 2-way external-calendar-sync hook (ticket 2.4).
//
// The ticket asks for a 2-way calendar-sync hook "behind an interface (do NOT build
// full Google/Apple sync)". This is that interface: the booking routes call into it at
// the lifecycle points where an external calendar would need to be pushed/pulled, and a
// real Google/Apple/CalDAV adapter can later be slotted in behind the SAME contract
// without touching the routes.
//
// SHAPE: a provider-agnostic CalendarSyncAdapter (mirroring 2.3's createCheckout/
// handleWebhook adapter pattern) with four operations the routes will need:
//   pushBooking(booking)   — a booking was created/confirmed → mirror it to the external
//                            calendar (returns an external event ref, or null).
//   updateBooking(booking) — a booking changed (reschedule/assign) → update the event.
//   removeBooking(booking) — a booking was declined/cancelled → delete the event.
//   pullBusy({providerId, staffUserId, from, to}) — the "2-way" half: read external busy
//                            windows so slot generation can subtract them.
//
// The default adapter is a NO-OP that records intent and is safe to call from any route
// in any environment (no network, no keys). getCalendarSync() returns it today; when a
// real adapter ships it is selected here by env, leaving every call site unchanged.

/**
 * The no-op adapter. Every method resolves successfully and changes nothing external,
 * so booking flows work end-to-end with sync "off". Returns are shaped like a real
 * adapter's so a caller can store an external ref without branching on stub-vs-real.
 */
export const noopCalendarSync = {
  name: "noop",

  /** A real adapter would create an external event and return its id. */
  async pushBooking(/* booking */) {
    return { synced: false, externalEventId: null };
  },

  /** A real adapter would patch the external event. */
  async updateBooking(/* booking */) {
    return { synced: false, externalEventId: null };
  },

  /** A real adapter would delete the external event. */
  async removeBooking(/* booking */) {
    return { synced: false };
  },

  /**
   * The 2-way (inbound) half: external busy windows to subtract from generated slots.
   * The stub reports no external busy windows, so availability == the provider's own
   * windows minus internal bookings. A real adapter returns [{ start, end }, …].
   */
  async pullBusy(/* { providerId, staffUserId, from, to } */) {
    return [];
  },
};

/**
 * Resolve the active calendar-sync adapter. Today this is always the no-op stub; a
 * real Google/Apple/CalDAV adapter would be selected by an env flag HERE (e.g.
 * process.env.CALENDAR_SYNC_PROVIDER) so no call site changes when sync is turned on.
 *
 * @returns {typeof noopCalendarSync} the adapter implementing the CalendarSync contract
 */
export function getCalendarSync() {
  return noopCalendarSync;
}
