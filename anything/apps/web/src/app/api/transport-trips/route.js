import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/transport-trips — the OWNER's own pet-taxi trips for the bookings hub (ticket 2.52).
// transport_trips RLS (owner SELECT) scopes rows to the caller; optional ?petId= filter.
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

    const trips = petId
      ? await sql`
          SELECT t.*, pr.name AS provider_name, pr.slug AS provider_slug
          FROM transport_trips t
          LEFT JOIN providers pr ON pr.id = t.provider_id
          WHERE t.owner_user_id = ${userId} AND t.pet_id = ${petId}
          ORDER BY t.scheduled_at DESC NULLS LAST, t.id DESC
        `
      : await sql`
          SELECT t.*, pr.name AS provider_name, pr.slug AS provider_slug
          FROM transport_trips t
          LEFT JOIN providers pr ON pr.id = t.provider_id
          WHERE t.owner_user_id = ${userId}
          ORDER BY t.scheduled_at DESC NULLS LAST, t.id DESC
        `;
    return Response.json({ trips });
  } catch (e) {
    console.error("[GET /api/transport-trips] Error:", e?.message);
    return Response.json({ error: "Failed to fetch trips" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
