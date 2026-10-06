// bellBadge — the number on the Feed header's bell.
//
// It used to count only locally generated reminder notifications + pending care-access requests, so a real
// server notification (a booking confirmed, an adoption decision, a lost-pet alert...) never lit the badge.
// Notifications v2: the server reports how many of the caller's DB notifications are unread (`unread_count`,
// present only while its NOTIF_V2_ENABLED flag is on); with the flag off that count is 0 and the badge is exactly
// what it was. The bell screen itself merges the same sources, so the number matches what the user finds inside.

const asCount = (n) => (Number.isInteger(n) && n > 0 ? n : 0);

/**
 * @param {{ reminders?: number, pendingAccess?: number, dbUnread?: number }} parts
 * @returns {number} total unread (>= 0)
 */
export function bellBadgeCount({ reminders, pendingAccess, dbUnread } = {}) {
  return asCount(reminders) + asCount(pendingAccess) + asCount(dbUnread);
}

/** The badge label: nothing for 0, "9+" above nine. */
export function bellBadgeLabel(count) {
  const n = asCount(count);
  if (n === 0) return null;
  return n > 9 ? "9+" : String(n);
}
