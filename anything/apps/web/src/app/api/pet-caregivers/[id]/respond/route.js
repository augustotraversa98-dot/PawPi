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
