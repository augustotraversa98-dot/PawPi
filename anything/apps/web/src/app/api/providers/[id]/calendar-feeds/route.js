import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import {
  requireProviderRole,
  ALL_PROVIDER_ROLES,
} from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Provider calendar feeds — business calendar IMPORT (ticket 2.84).
//   GET  — any active staff: list this provider's iCal/ICS feeds (+ last_synced_at).
//   POST — owner|admin: add a feed (a private Google/Outlook/Apple ICS URL). Busy blocks are NOT
//          fetched here — the provider hits "Refresh now" (the [feedId]/sync route) or the cron
//          picks it up. RLS (0064) gates by app_is_provider_admin / app_is_active_staff_of.

async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const providerId = params.id;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    const feeds = await sql`
      SELECT id, ics_url, last_synced_at, active, created_at, updated_at
      FROM provider_calendar_feeds
      WHERE provider_id = ${providerId} AND deleted_at IS NULL
      ORDER BY created_at ASC
    `;
    return Response.json({ feeds });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[GET /api/providers/[id]/calendar-feeds] Error:", error.message);
    return Response.json({ error: "Failed to fetch feeds" }, { status: 500 });
  }
}

async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const providerId = params.id;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    await requireProviderRole(providerId, userId);

    const body = (await request.json().catch(() => ({}))) ?? {};
    const icsUrl = String(body.ics_url || "").trim();
    if (!/^https?:\/\//i.test(icsUrl)) {
      return Response.json(
        { error: "ics_url must be an http(s) iCal feed URL" },
        { status: 400 },
      );
    }

    const created = await sql`
      INSERT INTO provider_calendar_feeds (provider_id, ics_url)
      VALUES (${providerId}, ${icsUrl})
      RETURNING id, ics_url, last_synced_at, active, created_at, updated_at
    `;
    return Response.json({ feed: created[0] }, { status: 201 });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[POST /api/providers/[id]/calendar-feeds] Error:", error.message);
    return Response.json({ error: "Failed to add feed" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
