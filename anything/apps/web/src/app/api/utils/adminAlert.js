import sql from "@/app/api/utils/sql";
import { safeNotify } from "@/app/api/utils/notify";
import { withSavepoint } from "@/app/api/utils/requestContext";
import { sendEmail } from "@/app/api/utils/email";
import { resolveAppOrigin } from "@/app/api/utils/passwordResetToken";

// MOD1 PR1 — alert every platform admin when a NEW content report is filed (Apple Guideline
// 1.2: reports must reach a human who can act inside 24h). Two channels per admin:
//   • an in-app bell (app_notify type 'report_received') — cheap, ALWAYS fires;
//   • an email — rate-limited per admin so a report burst cannot flood inboxes.
//
// FOUR guarantees, in order of importance:
//   1. NEVER throws, NEVER blocks, NEVER 500s the report. The report is already created and
//      committed-in-tx before this runs; alerting is best-effort and swallows every error.
//   2. CANNOT POISON THE REPORT'S TRANSACTION. Every DB call runs inside a SAVEPOINT (when a
//      real request transaction is open), so a failed query rolls back to the savepoint instead
//      of aborting the outer tx — which withRequestContext would otherwise turn into a blanket
//      500 that ALSO loses the report (see utils/requestContext withSavepoint).
//   3. DEGRADES CLEAN while unmigrated. app_admin_recipients() absent (42883) → no admins → no
//      alert, no error.
//   4. REPORTER-LESS. The bell is a SYSTEM notification (actor = null) and the email names the
//      target + reason but never the reporter, so moderation never leaks who flagged what.
//
// Only call this on a GENUINELY NEW report — never on the idempotent "already reported" repeat.

const ADMIN_EMAIL_BUCKET = "admin_report_email";
// Generous per-admin cap: a real moderation inbox should never be silenced, but a scripted
// report flood cannot turn into an inbox flood. The in-app bell is never capped.
const ADMIN_EMAIL_WINDOW_SECONDS = 3600;
const ADMIN_EMAIL_LIMIT = 20;

/**
 * Is a real request transaction open? porsager exposes `savepoint` on a TRANSACTION handle and
 * never on the pool; the `sql` proxy forwards to whichever is active. Mirrors utils/rateLimit —
 * lets unit tests (which mock `sql` with only a default export, no active tx) run the DB calls
 * straight through the mock, while production wraps them in a savepoint.
 */
function inRequestTransaction() {
  try {
    return typeof sql.savepoint === "function";
  } catch {
    return false;
  }
}

/** Run `fn`, savepoint-protected when a request transaction is open, else directly. */
function protectedRun(fn) {
  return inRequestTransaction() ? withSavepoint(fn) : fn();
}

/**
 * Alert admins of a new report. Best-effort; never throws.
 * @param {{ report: { id:number, target_type:string, target_id:number, reason?:string|null,
 *           details?:string|null }, reporterId?: number|null, request?: Request }} args
 */
export async function alertAdminsOfReport({ report, reporterId = null, request = null }) {
  try {
    if (!report || report.id == null) return;

    // Resolve admins via the DEFINER reader (the reporter's identity cannot SELECT other
    // profiles under FORCE RLS). Savepoint-protected + degrades clean when unmigrated.
    let admins;
    try {
      admins = await protectedRun(
        () => sql`SELECT user_id, email FROM app_admin_recipients()`,
      );
    } catch (e) {
      // 42883 undefined_function / 42P01 undefined_table → unmigrated: nothing to alert.
      if (e?.code === "42883" || e?.code === "42P01") return;
      throw e;
    }
    if (!admins || admins.length === 0) return;

    // (a) in-app bell to each admin — SYSTEM notification (actor null → reporter-less).
    const body = JSON.stringify({
      report_id: report.id,
      target_type: report.target_type ?? null,
      target_id: report.target_id ?? null,
      reason: report.reason ?? null,
    });
    for (const admin of admins) {
      if (admin?.user_id == null) continue;
      await safeNotify({
        recipient: admin.user_id,
        actor: null, // system alert; never reveal the reporter to the moderator queue
        type: "report_received",
        subjectRef: String(report.id),
        body,
      });
    }

    // (b) email each admin (rate-limited per admin). Best-effort; sendEmail never throws.
    await emailAdmins(admins, report, request);
  } catch (e) {
    console.error("[alertAdminsOfReport] non-fatal:", e?.message);
  }
}

async function emailAdmins(admins, report, request) {
  const targetType = report.target_type ?? "content";
  const reason = report.reason ?? "no reason given";
  const subject = `New PawPi report: ${targetType} — ${reason}`;
  const origin = resolveAppOrigin(request);
  const consoleUrl = origin ? `${origin}/admin/moderation` : "/admin/moderation";
  const text = [
    "A new content report was filed on PawPi and is waiting in the moderation queue.",
    "",
    `Target:  ${targetType} #${report.target_id ?? "?"}`,
    `Reason:  ${reason}`,
    report.details ? `Details: ${report.details}` : null,
    "",
    "Review and act on it here:",
    consoleUrl,
    "",
    "(This is an automated moderation alert. The reporter's identity is intentionally omitted.)",
  ]
    .filter((line) => line !== null)
    .join("\n");

  for (const admin of admins) {
    if (!admin?.email) continue; // no mailbox → the in-app bell already reached them
    let allowed = true;
    try {
      allowed = await protectedRun(async () => {
        const rows = await sql`
          SELECT allowed FROM app_rate_limit_hit(
            ${ADMIN_EMAIL_BUCKET}, ${`u:${admin.user_id}`},
            ${ADMIN_EMAIL_WINDOW_SECONDS}, ${ADMIN_EMAIL_LIMIT}
          )
        `;
        return rows?.[0]?.allowed !== false;
      });
    } catch {
      // Fail OPEN: a limiter hiccup must never silence a launch-blocking alert.
      allowed = true;
    }
    if (!allowed) continue;
    await sendEmail({ to: admin.email, subject, text });
  }
}
