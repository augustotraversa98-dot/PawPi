import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/dm-threads — owner ↔ owner 1:1 messaging (Phase 2 ticket 2.27). SEPARATE from the
// owner↔provider chat (/api/threads). PARTICIPANT-SCOPED at the DB layer (0045 RLS):
// visible/writable only to the two participants. These routes layer the human shape +
// the start-thread workflow; the RLS is the real guard.
//
// GET  /api/dm-threads        — list my DM threads (other participant + last message +
//                               my unread count), newest first.
// POST /api/dm-threads        — start (or reuse) a thread with another owner.
//                               Body: { otherUserId }. Idempotent per pair (normalized
//                               user_a < user_b + unique index).
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

    // RLS already restricts to threads I participate in; the WHERE pins it too. The
    // other participant is whichever side isn't me. unread_count = messages from the
    // OTHER side still unread.
    const threads = await sql`
      SELECT
        t.id,
        t.created_at,
        t.last_message_at,
        ou.id AS other_user_id,
        COALESCE(ou.full_name, ou.username) AS other_name,
        ou.username AS other_username,
        ou.avatar_url AS other_avatar_url,
        (
          SELECT m.body FROM dm_messages m
          WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1
        ) AS last_message_body,
        (
          SELECT m.image_url FROM dm_messages m
          WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1
        ) AS last_message_image_url,
        (
          SELECT COUNT(*)::int FROM dm_messages m
          WHERE m.thread_id = t.id
            AND m.sender_user_id <> ${userId}
            AND m.read_at IS NULL
        ) AS unread_count
      FROM dm_threads t
      JOIN user_profiles ou
        ON ou.id = (CASE WHEN t.user_a_id = ${userId} THEN t.user_b_id ELSE t.user_a_id END)
      WHERE t.user_a_id = ${userId} OR t.user_b_id = ${userId}
      ORDER BY t.last_message_at DESC
    `;

    return Response.json({ threads });
  } catch (error) {
    console.error("[GET /api/dm-threads] Error:", error.message);
    return Response.json({ error: "Failed to fetch threads" }, { status: 500 });
  }
}

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) ?? {};
    const otherUserId = Number(body.otherUserId);
    if (!Number.isInteger(otherUserId)) {
      return Response.json({ error: "otherUserId is required" }, { status: 400 });
    }
    if (otherUserId === userId) {
      return Response.json(
        { error: "Cannot start a thread with yourself" },
        { status: 400 },
      );
    }

    // The other user must exist.
    const otherRows = await sql`
      SELECT id FROM user_profiles WHERE id = ${otherUserId} LIMIT 1
    `;
    if (otherRows.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // Normalize the pair so (A,B) and (B,A) are one thread.
    const a = Math.min(userId, otherUserId);
    const b = Math.max(userId, otherUserId);

    // Idempotent: reuse the existing pair thread if present.
    const existing = await sql`
      SELECT id, user_a_id, user_b_id, created_at, last_message_at
      FROM dm_threads
      WHERE user_a_id = ${a} AND user_b_id = ${b}
      LIMIT 1
    `;
    if (existing.length > 0) {
      return Response.json({ thread: existing[0], reused: true });
    }

    const created = await sql`
      INSERT INTO dm_threads (user_a_id, user_b_id)
      VALUES (${a}, ${b})
      RETURNING id, user_a_id, user_b_id, created_at, last_message_at
    `;
    return Response.json({ thread: created[0], reused: false }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/dm-threads] Error:", error.message);
    return Response.json({ error: "Failed to start thread" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
