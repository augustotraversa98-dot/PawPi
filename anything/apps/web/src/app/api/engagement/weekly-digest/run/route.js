import sql from "@/app/api/utils/sql";
import { withTransaction, setCurrentUserId, withSavepoint } from "@/app/api/utils/requestContext";
import { sendEmail } from "@/app/api/utils/email";
import { digestPushBody, digestEmail } from "../message";

// POST /api/engagement/weekly-digest/run — the "Rex's Week" weekly SENDER (unit E11).
//
// MACHINE-TO-MACHINE (not user-authed): an external scheduler POSTs here (e.g. hourly) with the shared
// secret. It finds every pet whose owner-tz local time is Sunday >= 18:00 and whose current owner-tz
// week has not yet been digested (app_weekly_digest_due, a SECURITY DEFINER cross-owner enumerator —
// the run connects as pawpi_app with NO user identity, so it can only see the due set through a
// DEFINER, exactly like app_due_subscriptions/0039). For each due pet it CLAIMS the week by inserting
// a weekly_digest_state row (UNIQUE(pet_id, week_start) → a concurrent/re-run is a no-op), then sends a
// push (an in-app 'weekly_digest' notification via app_notify) and, if the owner opted in, an email.
//
// Idempotent (claim-then-send). Degrades cleanly: no CRON_SECRET → disabled; schema not applied
// (42P01/42883) → a clean 200 no-op; a per-pet failure is recorded, never aborts the run.

const UNDEFINED_TABLE = "42P01";
const UNDEFINED_FUNCTION = "42883";
const isMissingSchema = (e) => e?.code === UNDEFINED_TABLE || e?.code === UNDEFINED_FUNCTION;
const isMissingTable = (e) => e?.code === UNDEFINED_TABLE;
const toDayStr = (v) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v).slice(0, 10);

// Duplicated (not imported across the [id] route dir) — the honest state classifier, same rule as
// pets/[id]/weekly-digest/logic.decideDigestState.
function decideState({ walks, ringDays, moments, hasStreak }) {
  const total = Number(walks) + Number(ringDays) + Number(moments);
  if (total === 0 && !hasStreak) return "empty";
  if (Number(ringDays) === 0 && Number(walks) <= 1 && Number(moments) === 0) return "quiet";
  return "rich";
}

async function POST(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "scheduler not configured" }, { status: 503 });
  }
  if (request.headers.get("x-cron-secret") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  // `now` override + `limit` cap for deterministic testing; default now() and 500.
  const nowExpr = typeof body?.now === "string" && body.now ? body.now : null;
  const limit = Number.isInteger(body?.limit) ? body.limit : 500;

  // Cross-owner DEFINER enumeration of the due set. Missing schema → clean no-op.
  let due;
  try {
    due = nowExpr
      ? await sql`SELECT * FROM app_weekly_digest_due(${nowExpr}::timestamptz, ${limit})`
      : await sql`SELECT * FROM app_weekly_digest_due(now(), ${limit})`;
  } catch (e) {
    if (isMissingSchema(e)) {
      return Response.json({ processed: 0, note: "weekly digest schema not applied" });
    }
    throw e;
  }

  let sent = 0;
  const skipped = [];
  const failed = [];

  for (const row of due) {
    const petId = row.pet_id;
    const ownerUserId = row.owner_user_id;
    const tz = row.tz;
    const weekStart = toDayStr(row.week_start);
    const weekEnd = toDayStr(new Date(Date.UTC(
      +weekStart.slice(0, 4), +weekStart.slice(5, 7) - 1, +weekStart.slice(8, 10) + 7,
    )));
    const wantPush = row.push_enabled !== false;
    const wantEmail = row.email_enabled === true;
    const channels = [];
    if (wantPush) channels.push("push");
    if (wantEmail && row.email) channels.push("email");

    try {
      const outcome = await withTransaction(async () => {
        await setCurrentUserId(ownerUserId);

        // Claim the week FIRST — a concurrent run / re-run finds the row and skips (no double-send).
        const claim = await sql`
          INSERT INTO weekly_digest_state (pet_id, owner_user_id, week_start, channels)
          VALUES (${petId}, ${ownerUserId}, ${weekStart}::date, ${channels})
          ON CONFLICT (pet_id, week_start) DO NOTHING
          RETURNING id
        `;
        if (claim.length === 0) return { skip: "already sent" };

        // Compact REAL summary for the completed owner-tz week.
        const [walkRow] = await sql`
          SELECT count(*)::int AS n FROM health_walk_logs
          WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
            AND (start_time AT TIME ZONE ${tz})::date >= ${weekStart}::date
            AND (start_time AT TIME ZONE ${tz})::date <  ${weekEnd}::date
        `;
        const walks = walkRow.n;
        const [momentRow] = await sql`
          SELECT count(*)::int AS n FROM posts
          WHERE pet_id = ${petId} AND is_daily_update = true
            AND post_date >= ${weekStart}::date AND post_date < ${weekEnd}::date
        `;
        const moments = momentRow.n;

        let ringDays = 0;
        try {
          await withSavepoint(async () => {
            const [r] = await sql`
              SELECT count(*)::int AS n FROM pet_care_days
              WHERE pet_id = ${petId} AND ring_closed = true
                AND day >= ${weekStart}::date AND day < ${weekEnd}::date
            `;
            ringDays = r.n;
          });
        } catch (e) {
          if (!isMissingTable(e)) throw e;
        }

        let streakCurrent = 0;
        try {
          await withSavepoint(async () => {
            const [st] = await sql`SELECT current_count FROM pet_streaks WHERE pet_id = ${petId}`;
            if (st) streakCurrent = st.current_count || 0;
          });
        } catch (e) {
          if (!isMissingTable(e)) throw e;
        }

        const state = decideState({ walks, ringDays, moments, hasStreak: streakCurrent > 0 });

        // Push: an in-app 'weekly_digest' notification (system actor = null). Localized client-side.
        if (wantPush) {
          await sql`
            SELECT app_notify(${ownerUserId}, NULL, 'weekly_digest', ${String(petId)},
              ${digestPushBody({ petName: row.pet_name, walks, ringDays, streak: streakCurrent, state, weekStart })})
          `;
        }

        return { state, walks, ringDays, moments, streak: streakCurrent };
      });

      if (outcome?.skip) {
        skipped.push({ petId, reason: outcome.skip });
        continue;
      }

      // Email is OUTSIDE the transaction (sendEmail never throws; a slow vendor must not hold the tx).
      if (wantEmail && row.email) {
        // FF1: render in the recipient's stored locale ('en'|'es'); es-AR when null/absent
        // (pre-0107 the enumerator omits preferred_locale → undefined → the es fallback).
        const locale = row.preferred_locale === "en" ? "en" : "es";
        const { subject, text } = digestEmail({
          locale,
          petName: row.pet_name,
          walks: outcome.walks,
          ringDays: outcome.ringDays,
          streak: outcome.streak,
          state: outcome.state,
        });
        await sendEmail({ to: row.email, subject, text });
      }
      sent += 1;
    } catch (error) {
      failed.push({ petId, reason: error?.message ?? "error" });
    }
  }

  return Response.json({ processed: due.length, sent, skipped, failed });
}

export { POST };
