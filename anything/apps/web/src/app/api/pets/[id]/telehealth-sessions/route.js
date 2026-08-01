import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/pets/[id]/telehealth-sessions — the OWNER's video consults for a pet. Phase 2
// ticket 2.18. Owner-context: RLS on telehealth_sessions (0040) scopes to the owner branch,
// so the caller only ever sees their own pet's consults. Newest first; empty → [].
//
// Joins vet_appointments (via booking_id) for appointment_date/appointment_time so the
// mobile client can pre-check the 5-minute early-join gate (mirrors the server-side gate in
// .../telehealth/sessions/[sessionId]/join/route.js) and show a friendly countdown instead
// of a disabled-looking button.
async function GET(request, { params }) {
  try {
    const authSession = await auth();
    if (!authSession?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(authSession.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const petId = params.id;
    const sessions = await sql`
      SELECT
        ts.id, ts.booking_id, ts.pet_id, ts.owner_user_id, ts.provider_id,
        ts.status, ts.started_at, ts.ended_at, ts.summary, ts.created_at,
        p.name AS provider_name,
        va.appointment_date, va.appointment_time
      FROM telehealth_sessions ts
      LEFT JOIN providers p ON p.id = ts.provider_id
      LEFT JOIN vet_appointments va ON va.id = ts.booking_id
      WHERE ts.pet_id = ${petId}
        AND ts.owner_user_id = ${userId}
      ORDER BY ts.created_at DESC, ts.id DESC
    `;

    return Response.json({ sessions });
  } catch (e) {
    console.error(
      "[GET /api/pets/[id]/telehealth-sessions] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to fetch telehealth sessions" },
      { status: 500 },
    );
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
