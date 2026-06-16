import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Provider staff — the INVITEE accepts (or declines) their own invite. Ticket 4c.
//
// This is the ONE staff route that does NOT use requireProviderRole: the caller
// is not active staff yet, so there is no membership to authorize against.
// Authorization is invitee-self instead — the scoped UPDATE only flips a row
// whose user_profile_id equals the CALLER's own user_profiles.id AND whose status
// is still 'invited'. A different user accepting someone else's invite, or a
// caller with no pending invite for this provider, matches no row -> 404.

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

    // Optional decline: action='decline' soft-removes the invite instead of
    // activating it. Anything else (default) accepts.
    const body = (await request.json().catch(() => ({}))) ?? {};
    const newStatus = body.action === "decline" ? "removed" : "active";

    // Invitee-self authorization lives in the WHERE clause: only the caller's own
    // 'invited' row for THIS provider is touched. No such row -> 404.
    const updated = await sql`
      UPDATE provider_staff
      SET status = ${newStatus}, updated_at = NOW()
      WHERE provider_id = ${providerId}
        AND user_profile_id = ${userId}
        AND status = 'invited'
      RETURNING *
    `;

    if (updated.length === 0) {
      return Response.json(
        { error: "No pending invite for this provider" },
        { status: 404 },
      );
    }

    return Response.json({ staff: updated[0] });
  } catch (error) {
    console.error("[POST /api/providers/[id]/staff/accept] Error:", error.message);
    return Response.json(
      { error: "Failed to accept invite" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
