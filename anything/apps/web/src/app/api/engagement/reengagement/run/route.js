import sql from "@/app/api/utils/sql";
import { withTransaction, setCurrentUserId } from "@/app/api/utils/requestContext";
import { sendEmail } from "@/app/api/utils/email";
import { winbackPushBody, winbackEmail } from "../message";

// POST /api/engagement/reengagement/run — the win-back SENDER (unit E12).
//
// MACHINE-TO-MACHINE (not user-authed): an external scheduler POSTs here (e.g. daily) with the shared
// secret. It finds LAPSED pets DUE for a win-back via app_reengagement_due (a SECURITY DEFINER
// cross-owner enumerator — no ring activity for N owner-tz days, not opted out, none sent within the cap
// window), each row carrying a REAL hook (a recently-active friend + birthday/adoption dates). For each
// it CLAIMS the send (an ON CONFLICT ... WHERE cap guard on reengagement_state → a concurrent/re-run is
// a no-op), then sends a warm push ('winback', localized client-side) + email (preferred). Never
// fabricates a hook — falls back to the pet's own memory.
//
// WARM, never guilt. Escalation-free (at most one send per cap window). Degrades cleanly: no CRON_SECRET
// → disabled; schema not applied → clean 200 no-op; a per-pet failure is recorded, never aborts the run.

const UNDEFINED_TABLE = "42P01";
const UNDEFINED_FUNCTION = "42883";
const isMissingSchema = (e) => e?.code === UNDEFINED_TABLE || e?.code === UNDEFINED_FUNCTION;
const toDayStr = (v) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v).slice(0, 10);

// Inline (not imported across the [id] route dir): the honest win-back hook picker + milestone math,
// same rule as pets/[id]/reengagement/logic + pets/[id]/weekly-digest/logic.upcomingMilestone.
function nextAnniversaryDays(eventDate, today) {
  if (!eventDate || !today) return null;
  const e = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(eventDate).slice(0, 10));
  const t = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(today).slice(0, 10));
  if (!e || !t) return null;
  const todayUtc = Date.UTC(+t[1], +t[2] - 1, +t[3]);
  let occ = Date.UTC(+t[1], +e[2] - 1, +e[3]);
  if (occ < todayUtc) occ = Date.UTC(+t[1] + 1, +e[2] - 1, +e[3]);
  return Math.round((occ - todayUtc) / 86400000);
}
function pickMilestone(birthday, adoptionDate, today, windowDays = 14) {
  const cands = [];
  const bd = nextAnniversaryDays(birthday, today);
  if (bd != null && bd <= windowDays) cands.push({ kind: "birthday", in_days: bd });
  const ad = nextAnniversaryDays(adoptionDate, today);
  if (ad != null && ad <= windowDays) cands.push({ kind: "gotcha", in_days: ad });
  if (!cands.length) return null;
  cands.sort((a, b) => a.in_days - b.in_days);
  return cands[0];
}
function pickHook({ milestone, friendName, petName }) {
  if (milestone) return { hook: "milestone", milestoneKind: milestone.kind, inDays: milestone.in_days, petName };
  if (friendName) return { hook: "friend", friendName, petName };
  return { hook: "memory", petName };
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
  const nowExpr = typeof body?.now === "string" && body.now ? body.now : null;
  const lapsedDays = Number.isInteger(body?.lapsed_days) ? body.lapsed_days : 7;
  const capDays = Number.isInteger(body?.cap_days) ? body.cap_days : 14;
  const limit = Number.isInteger(body?.limit) ? body.limit : 500;

  let due;
  try {
    due = nowExpr
      ? await sql`SELECT * FROM app_reengagement_due(${nowExpr}::timestamptz, ${lapsedDays}, ${capDays}, ${limit})`
      : await sql`SELECT * FROM app_reengagement_due(now(), ${lapsedDays}, ${capDays}, ${limit})`;
  } catch (e) {
    if (isMissingSchema(e)) {
      return Response.json({ processed: 0, note: "reengagement schema not applied" });
    }
    throw e;
  }

  let sent = 0;
  const skipped = [];
  const failed = [];

  for (const row of due) {
    const petId = row.pet_id;
    const ownerUserId = row.owner_user_id;
    const today = toDayStr(row.today); // owner-tz today, computed by the enumerator
    const milestone = pickMilestone(toDayStr(row.birthday), toDayStr(row.adoption_date), today, 14);
    const hook = pickHook({ milestone, friendName: row.friend_name, petName: row.pet_name });
    const channel = row.email ? "email+push" : "push";

    try {
      const claimed = await withTransaction(async () => {
        await setCurrentUserId(ownerUserId);
        // Claim the send with a cap guard (idempotent under concurrent/re-runs).
        const claim = await sql`
          INSERT INTO reengagement_state
            (pet_id, owner_user_id, lapsed_since, last_winback_sent, winback_channel, winback_count, updated_at)
          VALUES (${petId}, ${ownerUserId}, ${today}::date, now(), ${channel}, 1, now())
          ON CONFLICT (pet_id) DO UPDATE SET
            last_winback_sent = now(),
            winback_channel = ${channel},
            winback_count = reengagement_state.winback_count + 1,
            lapsed_since = COALESCE(reengagement_state.lapsed_since, ${today}::date),
            updated_at = now()
          WHERE reengagement_state.opted_out = false
            AND (reengagement_state.last_winback_sent IS NULL
                 OR reengagement_state.last_winback_sent < now() - make_interval(days => ${capDays}))
          RETURNING pet_id
        `;
        if (claim.length === 0) return false;

        // Warm in-app win-back push (system actor). Localized client-side by hook.
        await sql`
          SELECT app_notify(${ownerUserId}, NULL, 'winback', ${String(petId)},
            ${winbackPushBody({
              hook: hook.hook, petName: hook.petName, friendName: hook.friendName ?? null,
              milestoneKind: hook.milestoneKind ?? null, inDays: hook.inDays ?? null,
            })})
        `;
        return true;
      });

      if (!claimed) {
        skipped.push({ petId, reason: "capped or opted out" });
        continue;
      }

      // Email preferred, outside the transaction (sendEmail never throws).
      if (row.email) {
        // FF1: render in the recipient's stored locale ('en'|'es'); es-AR when null/absent
        // (pre-0107 the enumerator omits preferred_locale → undefined → the es fallback).
        const locale = row.preferred_locale === "en" ? "en" : "es";
        const { subject, text } = winbackEmail({
          locale,
          hook: hook.hook, petName: hook.petName, friendName: hook.friendName ?? null,
          milestoneKind: hook.milestoneKind ?? null, inDays: hook.inDays ?? null,
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
