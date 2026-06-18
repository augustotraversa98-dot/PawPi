import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/prescriptions?petId= — the OWNER's prescriptions for the Vet Record (ticket 2.53).
// RLS (prescriptions_owner_read) scopes to the caller; labeled by the issuing clinic. Read-only —
// the owner can never create/edit an Rx. Also returns the owner's refill requests for status.
//
// DB is porsager's tagged-template `sql`.
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
    const petId = searchParams.get("petId");
    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    const prescriptions = await sql`
      SELECT pr.*, prov.name AS clinic_name
      FROM prescriptions pr
      LEFT JOIN providers prov ON prov.id = pr.provider_id
      WHERE pr.owner_user_id = ${userId} AND pr.pet_id = ${petId}
      ORDER BY pr.issued_at DESC, pr.id DESC
    `;
    const refillRequests = await sql`
      SELECT id, prescription_id, status, requested_at, decided_at
      FROM rx_refill_requests
      WHERE owner_user_id = ${userId} AND pet_id = ${petId}
      ORDER BY requested_at DESC
    `;
    return Response.json({ prescriptions, refillRequests });
  } catch (e) {
    console.error("[GET /api/prescriptions] Error:", e?.message);
    return Response.json({ error: "Failed to fetch prescriptions" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
