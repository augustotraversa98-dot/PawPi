import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { requireProviderRole } from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// DELETE /api/providers/[id]/calendar-feeds/[feedId] — owner|admin removes a feed (ticket 2.84).
// Soft-delete (history preserved) AND clears its imported busy blocks via the SECURITY DEFINER
// app_remove_calendar_feed, so the removed feed no longer blocks availability.
async function DELETE(request, { params }) {
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

    // The feed must belong to THIS provider (owner can read it under RLS).
    const rows = await sql`
      SELECT id FROM provider_calendar_feeds
      WHERE id = ${feedId} AND provider_id = ${providerId} AND deleted_at IS NULL
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Feed not found" }, { status: 404 });
    }

    await sql`SELECT app_remove_calendar_feed(${feedId})`;
    return Response.json({ removed: true });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "[DELETE /api/providers/[id]/calendar-feeds/[feedId]] Error:",
      error.message,
    );
    return Response.json({ error: "Failed to remove feed" }, { status: 500 });
  }
}

const wrappedDELETE = withRequestContext(DELETE);
export { wrappedDELETE as DELETE };
