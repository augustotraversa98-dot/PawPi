import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// The grantee accepts or declines a pending grant (ticket 2.47). All the work — verify the
// pending grant names the caller, flip status, write the audit row — happens in the
// respond_pet_caregiver() SECURITY DEFINER helper, so the grantee can't touch role/scopes.

async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const grantId = parseInt(params.id);
    const body = await request.json();
    const accept = body.accept === true;
    if (!Number.isInteger(grantId)) {
      return Response.json({ error: "Invalid grant" }, { status: 400 });
    }

    // A pending invite whose access window has already passed cannot be accepted: it would become "active" with a gate that
    // always denies. The grantee can read their own grant under RLS, so this is a plain lookup.
    const pending = await sql`
      SELECT expires_at FROM pet_caregivers
      WHERE id = ${grantId} AND grantee_user_id = ${userId} AND status = 'pending'
    `;
    if (pending.length > 0 && pending[0].expires_at && new Date(pending[0].expires_at).getTime() <= Date.now()) {
      return Response.json(
        { error: "This invitation has expired.", code: "invite_expired" },
        { status: 410 },
      );
    }

    try {
      const rows = await sql`SELECT respond_pet_caregiver(${grantId}, ${accept}) AS status`;
      return Response.json({ status: rows[0].status });
    } catch (e) {
      if (String(e.message).includes("no pending grant")) {
        return Response.json({ error: "No pending invite for you" }, { status: 404 });
      }
      throw e;
    }
  } catch (error) {
    console.error("[POST /api/pet-caregivers/[id]/respond] Error:", error.message);
    return Response.json({ error: "Failed to respond" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
