import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { isBlockedBetween } from "@/app/api/utils/moderation";

// /api/dm-threads/[id]/messages — messages on one owner↔owner DM thread (ticket 2.27).
//   GET  — newest-first, paginated (?limit=&before=<id>). RLS returns ZERO rows for a
//          non-participant (no leak).
//   POST — send a message ({ body?, image_url? }, at least one). The 0045 WITH CHECK
//          forces sender = caller AND participant; a violation surfaces as 403.
// DB is porsager's tagged-template `sql`.

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

    const threadId = params.id;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "30", 10) || 30, 1),
      100,
    );
    const before = searchParams.get("before");

    // Load limit+1 to compute hasMore. RLS scopes to the participant.
    const rows = before
      ? await sql`
          SELECT id, thread_id, sender_user_id, body, image_url, read_at, created_at
          FROM dm_messages
          WHERE thread_id = ${threadId} AND id < ${before}
            AND hidden_at IS NULL
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit + 1}
        `
      : await sql`
          SELECT id, thread_id, sender_user_id, body, image_url, read_at, created_at
          FROM dm_messages
          WHERE thread_id = ${threadId}
            AND hidden_at IS NULL
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit + 1}
        `;

    const hasMore = rows.length > limit;
    const messages = hasMore ? rows.slice(0, limit) : rows;

    return Response.json({ messages, hasMore });
  } catch (error) {
    console.error("[GET /api/dm-threads/[id]/messages] Error:", error.message);
    return Response.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}

async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const threadId = params.id;
    const body = (await request.json().catch(() => ({}))) ?? {};
    const text = typeof body.body === "string" ? body.body.trim() : "";
    const imageUrl =
      typeof body.image_url === "string" && body.image_url.length > 0
        ? body.image_url
        : null;

    if (text.length === 0 && !imageUrl) {
      return Response.json(
        { error: "A message needs text or an image" },
        { status: 400 },
      );
    }

    // Moderation (T3): a blocked pair can't DM. Find the OTHER participant of this thread
    // (RLS scopes the row to the caller — a non-participant gets nothing) and 403 if blocked
    // either direction. existing threads stop accepting new messages between blocked users.
    const threadRows = await sql`
      SELECT user_a_id, user_b_id FROM dm_threads WHERE id = ${threadId} LIMIT 1
    `;
    if (threadRows.length > 0) {
      const { user_a_id, user_b_id } = threadRows[0];
      const otherUserId = user_a_id === userId ? user_b_id : user_a_id;
      if (await isBlockedBetween(userId, otherUserId)) {
        return Response.json(
          { error: "You can't message this user" },
          { status: 403 },
        );
      }
    }

    let created;
    try {
      // RLS WITH CHECK: sender = caller AND participant. A non-participant insert raises
      // 42501 (row-level security) → surfaced as 403 below.
      created = await sql`
        INSERT INTO dm_messages (thread_id, sender_user_id, body, image_url)
        VALUES (${threadId}, ${userId}, ${text.length > 0 ? text : null}, ${imageUrl})
        RETURNING id, thread_id, sender_user_id, body, image_url, read_at, created_at
      `;
    } catch (e) {
      if (e?.code === "42501") {
        return Response.json(
          { error: "Not a participant of this thread" },
          { status: 403 },
        );
      }
      throw e;
    }

    // Bump the thread's sort key (participant-scoped UPDATE under RLS).
    await sql`
      UPDATE dm_threads SET last_message_at = now() WHERE id = ${threadId}
    `;

    return Response.json({ message: created[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/dm-threads/[id]/messages] Error:", error.message);
    return Response.json({ error: "Failed to send message" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
