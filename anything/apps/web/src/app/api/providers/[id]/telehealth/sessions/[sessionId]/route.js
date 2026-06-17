import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// PATCH /api/providers/[id]/telehealth/sessions/[sessionId] — END or CANCEL a consult.
// Phase 2 ticket 2.18.
//
// PARTICIPANT-ONLY: the UPDATE runs under the caller's RLS identity, so telehealth_sessions
// (0040) only lets the OWNER or the ASSIGNED active staff change the row. A non-participant
// matches no row → 403. The clinical note is written separately via the notes route
// (medical_write) — this endpoint only manages the session lifecycle + an optional recap.
async function PATCH(request, { params }) {
  try {
    const authSession = await auth();
    if (!authSession?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(authSession.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const providerId = params.id;
    const sessionId = params.sessionId;
    const body = (await request.json()) ?? {};
    const { action, summary } = body;

    if (action !== "end" && action !== "cancel") {
      return Response.json(
        { error: "action must be 'end' or 'cancel'" },
        { status: 400 },
      );
    }

    let updated;
    if (action === "end") {
      updated = await sql`
        UPDATE telehealth_sessions
        SET status = 'ended',
            ended_at = NOW(),
            summary = COALESCE(${summary ?? null}, summary),
            updated_at = NOW()
        WHERE id = ${sessionId} AND provider_id = ${providerId}
        RETURNING *
      `;
    } else {
      updated = await sql`
        UPDATE telehealth_sessions
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = ${sessionId} AND provider_id = ${providerId}
        RETURNING *
      `;
    }

    // RLS returned no row → the caller isn't a participant (or it doesn't exist).
    if (updated.length === 0) {
      return Response.json(
        { error: "Consult not found or not a participant" },
        { status: 403 },
      );
    }

    return Response.json({ session: updated[0] });
  } catch (e) {
    console.error(
      "[PATCH /api/providers/[id]/telehealth/sessions/[sessionId]] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to update consult" },
      { status: 500 },
    );
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
