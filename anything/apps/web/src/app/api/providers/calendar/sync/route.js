import sql from "@/app/api/utils/sql";
import { parseIcsBusy, fetchIcsFeed } from "@/app/api/utils/calendarImport";

// POST /api/providers/calendar/sync — the business-calendar IMPORT scheduler (ticket 2.84).
//
// MACHINE-TO-MACHINE (not user-authed), mirroring the 2.17 subscription cron: an external scheduler
// (host cron / CI cron) POSTs here on a cadence with the shared secret header. It enumerates every
// active feed via the SECURITY DEFINER app_active_calendar_feeds() (cross-owner), fetches each ICS,
// parses VEVENTs → busy windows, and replaces that feed's busy blocks via app_sync_calendar_feed.
// PawPi has no built-in scheduler — FLAG CRON_SECRET + an external scheduler for Tats. All writes go
// through DEFINER fns, so no per-owner identity is needed. One bad/unreachable feed fails soft.
async function POST(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "scheduler not configured" }, { status: 503 });
  }
  if (request.headers.get("x-cron-secret") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const feeds = await sql`SELECT * FROM app_active_calendar_feeds()`;

  let synced = 0;
  const failed = [];
  for (const feed of feeds) {
    try {
      const icsText = await fetchIcsFeed(feed.ics_url);
      if (icsText == null) {
        failed.push({ feedId: feed.id, reason: "unreachable" });
        continue;
      }
      const events = parseIcsBusy(icsText);
      await sql`SELECT app_sync_calendar_feed(${feed.id}, ${sql.json(events)}::jsonb)`;
      synced += 1;
    } catch (error) {
      failed.push({ feedId: feed.id, reason: error?.message ?? "error" });
    }
  }

  return Response.json({ processed: feeds.length, synced, failed });
}

export { POST };
