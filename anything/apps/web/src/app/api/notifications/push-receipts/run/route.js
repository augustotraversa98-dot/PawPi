import sql from "@/app/api/utils/sql";
import { secretEquals } from "@/app/api/utils/secretCompare";
import { isNotifV2Enabled, softV2 } from "@/app/api/utils/notifV2";
import { getExpoClient } from "@/app/api/utils/push";

// POST /api/notifications/push-receipts/run — Expo push RECEIPTS job (notifications v2, PR 3a).
//
// MACHINE-TO-MACHINE (x-cron-secret, like the other cron endpoints). Expo makes a delivery receipt available
// ~15 minutes after a send and keeps it for 24 hours. For every stored ticket (push_tickets, 0131) at least
// 15 minutes old it asks Expo for the receipt and:
//   • status ok            -> ticket resolved;
//   • DeviceNotRegistered  -> the token is dead: app_mark_push_token_invalid (it is skipped from now on);
//   • any other error      -> logged (type only, never the token) and resolved;
//   • receipt not ready    -> left pending for the next run, unless the ticket is > 24 h old (resolved, Expo
//                             no longer has it).
// Then it sweeps notification_send_log older than 90 days.
//
// FLAG: does NOTHING (no query) unless NOTIF_V2_ENABLED is on. Missing schema (0131 not applied) -> a clean 200
// no-op. Idempotent; a re-run only ever touches unresolved tickets. Never throws past the JSON response.

const MIN_AGE_SECONDS = 15 * 60;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BATCH = 1000;

async function POST(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "scheduler not configured" }, { status: 503 });
  }
  if (!secretEquals(request.headers.get("x-cron-secret") ?? "", secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isNotifV2Enabled()) {
    return Response.json({ skipped: "disabled" });
  }

  const pending = await softV2(
    () => sql`SELECT * FROM app_pending_push_tickets(${MIN_AGE_SECONDS}, ${BATCH})`,
    null,
  );
  if (pending === null) {
    return Response.json({ processed: 0, note: "push receipts schema not available" });
  }

  const now = Date.now();
  const toResolve = [];
  const live = [];
  for (const t of pending) {
    const age = now - new Date(t.created_at).getTime();
    if (age > MAX_AGE_MS) toResolve.push(t.id);
    else live.push(t);
  }

  let ok = 0;
  let invalidated = 0;
  let otherErrors = 0;
  let stillPending = 0;

  if (live.length > 0) {
    try {
      const expo = getExpoClient();
      const byTicket = new Map(live.map((t) => [t.ticket_id, t]));
      for (const idChunk of expo.chunkPushNotificationReceiptIds([...byTicket.keys()])) {
        const receipts = (await expo.getPushNotificationReceiptsAsync(idChunk)) ?? {};
        for (const ticketId of idChunk) {
          const t = byTicket.get(ticketId);
          const receipt = receipts[ticketId];
          if (!receipt) {
            stillPending += 1;
            continue;
          }
          toResolve.push(t.id);
          if (receipt.status === "ok") {
            ok += 1;
          } else if (receipt.details?.error === "DeviceNotRegistered") {
            invalidated += 1;
            await softV2(() => sql`SELECT app_mark_push_token_invalid(${t.token})`, null);
          } else {
            otherErrors += 1;
            console.error(`[push-receipts] receipt error: ${receipt.details?.error ?? "unknown"}`);
          }
        }
      }
    } catch (e) {
      // Expo outage: leave everything pending, try again next run.
      console.error("[push-receipts] Expo receipts fetch failed (non-fatal):", e?.message);
    }
  }

  let resolved = 0;
  if (toResolve.length > 0) {
    resolved =
      (await softV2(async () => {
        const rows = await sql`SELECT app_resolve_push_tickets(${toResolve}::bigint[]) AS n`;
        return Number(rows?.[0]?.n ?? 0);
      }, 0)) ?? 0;
  }

  const swept = await softV2(async () => {
    const rows = await sql`SELECT app_notification_send_log_gc(90) AS n`;
    return Number(rows?.[0]?.n ?? 0);
  }, 0);

  return Response.json({
    processed: pending.length,
    ok,
    invalidated,
    otherErrors,
    stillPending,
    resolved,
    logRowsSwept: swept,
  });
}

export { POST };
