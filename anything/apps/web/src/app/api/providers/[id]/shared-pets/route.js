import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { requireProviderRole, ALL_PROVIDER_ROLES } from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/providers/[id]/shared-pets → { pets: [{ pet_id, pet_name, expires_at }] }: the pets whose vet record is
// shared with this business right now, so it can open a record without a booking. It lists only what
// GET .../pets/[petId]/record would open: an active, unexpired grant, given by the pet's current owner, that is by
// section or includes medical_read. A pending request is not listed. Names only, no record data.
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    if (!/^\d{1,9}$/.test(String(params.id))) {
      return Response.json({ error: "Not authorized for this provider" }, { status: 403 });
    }
    await requireProviderRole(params.id, userId, ALL_PROVIDER_ROLES);

    const pets = await sql`
      SELECT g.pet_id, p.name AS pet_name, g.expires_at
      FROM care_access_grants g
      JOIN pets p ON p.id = g.pet_id AND p.owner_user_id = g.owner_user_id
      WHERE g.provider_id = ${params.id}
        AND g.status = 'active'
        AND (g.expires_at IS NULL OR g.expires_at > now())
        AND (g.sections IS NOT NULL OR 'medical_read' = ANY (g.scopes))
      ORDER BY p.name, g.pet_id
    `;

    return Response.json({ pets });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[GET /api/providers/[id]/shared-pets] Error:", error.message);
    return Response.json({ error: "Failed to fetch shared pets" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
