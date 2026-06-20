import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { requireProviderRole } from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { parseIcsBusy, fetchIcsFeed } from "@/app/api/utils/calendarImport";

// POST /api/providers/[id]/calendar-feeds/[feedId]/sync — "Refresh now" (ticket 2.84). owner|admin
// re-fetches ONE feed's ICS, parses its VEVENTs into busy windows, and replaces the feed's busy
// blocks via the SECURITY DEFINER app_sync_calendar_feed. An invalid/unreachable URL FAILS SOFT
// (synced:0 + a clean message), never a 500.
async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: providerId, feedId } = params;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    await requireProviderRole(providerId, userId);

    const rows = await sql`
      SELECT id, ics_url FROM provider_calendar_feeds
      WHERE id = ${feedId} AND provider_id = ${providerId} AND deleted_at IS NULL
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Feed not found" }, { status: 404 });
    }

    const icsText = await fetchIcsFeed(rows[0].ics_url);
    if (icsText == null) {
      return Response.json(
        { synced: 0, ok: false, error: "Couldn't reach that calendar feed" },
        { status: 200 },
      );
    }
    const events = parseIcsBusy(icsText);
    const result = await sql`
      SELECT app_sync_calendar_feed(${feedId}, ${sql.json(events)}::jsonb) AS written
    `;
    return Response.json({ synced: result[0]?.written ?? 0, ok: true });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "[POST /api/providers/[id]/calendar-feeds/[feedId]/sync] Error:",
      error.message,
    );
    return Response.json({ error: "Failed to sync feed" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
