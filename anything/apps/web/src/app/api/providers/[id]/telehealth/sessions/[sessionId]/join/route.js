import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { getVideoRoom, VideoNotConfiguredError } from "@/app/api/utils/video";

// POST /api/providers/[id]/telehealth/sessions/[sessionId]/join — a PARTICIPANT joins the
// video room. Phase 2 ticket 2.18.
//
// PARTICIPANT-ONLY: the SELECT runs under the caller's RLS identity, so telehealth_sessions
// (0040) returns the row ONLY to the OWNER of the pet or the ASSIGNED active staff. A
// non-participant gets no row → 403. We never hand a join link to a non-participant.
//
// The video vendor is dormant behind keys: getVideoRoom throws VideoNotConfiguredError when
// unconfigured → a clean 503, nothing crashes (mirrors payments). On the FIRST join we flip
// the session scheduled → in_progress and stamp started_at.
async function POST(request, { params }) {
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

    // RLS scopes this read to participants only.
    const rows = await sql`
      SELECT * FROM telehealth_sessions
      WHERE id = ${sessionId} AND provider_id = ${providerId}
      LIMIT 1
    `;
    if (rows.length === 0) {
      return Response.json(
        { error: "Not a participant in this consult" },
        { status: 403 },
      );
    }
    let consult = rows[0];

    if (consult.status === "cancelled" || consult.status === "ended") {
      return Response.json(
        { error: `This consult is ${consult.status}` },
        { status: 409 },
      );
    }

    // Dormant-behind-keys: 503 if the video vendor isn't configured (nothing crashes).
    // participantName/persistRoomRef are 'daily'-only (the 'generic' adapter ignores them):
    // persistRoomRef saves a newly-created Daily room name onto room_ref so the OTHER
    // participant's join reuses the same room instead of creating a second one.
    const isOwner = consult.owner_user_id === userId;
    const participantName =
      authSession.user.name || (isOwner ? "Pet Owner" : "Vet");
    const room = await getVideoRoom({
      session: consult,
      participantName,
      persistRoomRef: (roomName) =>
        sql`UPDATE telehealth_sessions SET room_ref = ${roomName}, updated_at = NOW() WHERE id = ${sessionId}`,
    });

    // First join flips scheduled → in_progress (+ started_at). Both participants may update
    // under the session RLS. Idempotent: a re-join while in_progress doesn't re-stamp.
    if (consult.status === "scheduled") {
      const updated = await sql`
        UPDATE telehealth_sessions
        SET status = 'in_progress', started_at = NOW(), updated_at = NOW()
        WHERE id = ${sessionId}
        RETURNING *
      `;
      consult = updated[0] ?? consult;
    }

    return Response.json({
      joinUrl: room.joinUrl,
      token: room.token,
      room: room.room,
      session: consult,
    });
  } catch (e) {
    if (e instanceof VideoNotConfiguredError || e.status === 503) {
      return Response.json({ error: e.message }, { status: 503 });
    }
    console.error(
      "[POST /api/providers/[id]/telehealth/sessions/[sessionId]/join] Error:",
      e?.message,
    );
    return Response.json({ error: "Failed to join consult" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
