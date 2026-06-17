import sql from "@/app/api/utils/sql";

// Fire-and-don't-block notification insert (ticket 2.26). Inserts a row via the
// app_notify() SECURITY DEFINER helper so the ACTOR can create a notification for a
// DIFFERENT recipient (the recipient-keyed RLS can't allow that directly).
//
// Rules baked in:
//   • NEVER throws — a failed notify must not fail the underlying social action.
//   • NEVER notifies a user about their own action (recipient === actor → skip; the
//     DB helper also no-ops on recipient = actor as a backstop).
// Uses the request-scoped `sql` (same module the route uses, so it runs in the
// withRequestContext identity).
export async function safeNotify({ recipient, actor, type, subjectRef, body }) {
  try {
    if (recipient == null || actor == null || recipient === actor) return;
    await sql`
      SELECT app_notify(
        ${recipient}, ${actor}, ${type}, ${subjectRef ?? null}, ${body ?? null}
      )
    `;
  } catch (error) {
    // Non-fatal: log and move on so the paw/bark/follow still succeeds.
    console.error("[safeNotify] non-fatal:", error?.message);
  }
}
