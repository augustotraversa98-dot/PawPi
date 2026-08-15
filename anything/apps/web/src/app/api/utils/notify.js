import sql from "@/app/api/utils/sql";
import { pushForNotification } from "@/app/api/utils/push";

// Fire-and-don't-block notification insert (ticket 2.26). Inserts a row via the
// app_notify() SECURITY DEFINER helper so the ACTOR can create a notification for a
// DIFFERENT recipient (the recipient-keyed RLS can't allow that directly).
//
// Rules baked in:
//   • NEVER throws — a failed notify must not fail the underlying action.
//   • NEVER notifies a user about their own action (recipient === actor → skip; the
//     DB helper also no-ops on recipient = actor as a backstop).
//   • A SYSTEM notification (actor == null) is allowed through — used for booking
//     lifecycle events the OWNER triggers on themselves (e.g. "you booked X"), which
//     would otherwise be swallowed by the recipient === actor self-notify no-op.
//   • BN2 remote-push hook: when app_notify actually created a bell row (returned a
//     non-null id — a self/disabled-category notify returns null and never pushes),
//     hand off to pushForNotification, which consults the channel catalog + the
//     recipient's prefs and rings the phone per rule. Best-effort, never throws.
// Uses the request-scoped `sql` (same module the route uses, so it runs in the
// withRequestContext identity).
export async function safeNotify({ recipient, actor, type, subjectRef, body }) {
  try {
    if (recipient == null || recipient === actor) return;
    const rows = await sql`
      SELECT app_notify(
        ${recipient}, ${actor ?? null}, ${type}, ${subjectRef ?? null}, ${body ?? null}
      ) AS id
    `;
    const notificationId = rows?.[0]?.id ?? null;
    // Only push when a bell row was really inserted. A null id means the DB gated it
    // (self-notify, or a disabled PUSH category) — nothing to ring.
    if (notificationId == null) return;
    await pushForNotification({ recipient, actor, type, subjectRef, body });
  } catch (error) {
    // Non-fatal: log and move on so the underlying action still succeeds.
    console.error("[safeNotify] non-fatal:", error?.message);
  }
}

// Compact JSON body for a booking-lifecycle notification. Carries the dynamic values
// the mobile bell needs to render a localized title in the RECIPIENT's language
// (service + provider name, and the raw appointment date/time so the client formats it
// in-locale). Any null/unknown field is preserved as null so the client can fall back.
export function bookingNotifyBody({ service, provider, date, time }) {
  return JSON.stringify({
    service: service ?? null,
    provider: provider ?? null,
    date: date ?? null,
    time: time ?? null,
  });
}
