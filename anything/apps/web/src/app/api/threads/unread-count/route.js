import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/threads/unread-count — the caller's total unread message count (ticket 2.5).
//
// Counts messages the caller can SEE (RLS scopes to threads they participate in) that
// were sent by the OTHER side (sender_user_id <> me) and are still unread (read_at
// NULL). Drives the inbox badge on the mobile Messages screen + the web Chats tab.
// Optional ?side=owner|provider[&providerId=] mirrors the threads list so each inbox can
// badge its own scope; default counts across ALL the caller's threads.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const side = searchParams.get("side");
    const providerId = searchParams.get("providerId");

    // The thread filter mirrors the list route: owner = my own threads; provider =
    // threads of the named provider (RLS already restricts to ones I staff); default =
    // every thread RLS lets me see. The unread predicate is identical in all cases.
    let rows;
    if (side === "provider" && providerId) {
      rows = await sql`
        SELECT COUNT(*)::int AS unread_count
        FROM messages m
        JOIN message_threads t ON t.id = m.thread_id
        WHERE t.provider_id = ${providerId}
          AND m.sender_user_id <> ${userId}
          AND m.read_at IS NULL
      `;
    } else if (side === "owner") {
      rows = await sql`
        SELECT COUNT(*)::int AS unread_count
        FROM messages m
        JOIN message_threads t ON t.id = m.thread_id
        WHERE t.owner_user_id = ${userId}
          AND m.sender_user_id <> ${userId}
          AND m.read_at IS NULL
      `;
    } else {
      rows = await sql`
        SELECT COUNT(*)::int AS unread_count
        FROM messages m
        WHERE m.sender_user_id <> ${userId}
          AND m.read_at IS NULL
      `;
    }

    return Response.json({ unread_count: rows[0]?.unread_count ?? 0 });
  } catch (error) {
    console.error("[GET /api/threads/unread-count] Error:", error.message);
    return Response.json({ error: "Failed to fetch unread count" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
