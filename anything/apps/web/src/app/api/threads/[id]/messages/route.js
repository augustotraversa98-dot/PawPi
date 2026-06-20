import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/threads/[id]/messages — the conversation view (Phase 2 ticket 2.5).
//
// GET  — messages on a thread, NEWEST-first, paginated by ?limit= (default 30, max
//        100) + ?before= (a message id; returns messages older than it). The thread's
//        own RLS (0031) means a non-participant simply gets zero rows — no extra auth
//        gate needed beyond identity. Returns { messages, hasMore }.
// POST — send a message. Body: { body?, attachment_url? } — at least one required (the
//        0031 CHECK forbids an empty message; attachment_url reuses the Supabase
//        Storage upload path). sender_user_id is forced to the CALLER (the RLS WITH
//        CHECK also enforces this — you can only post AS yourself). Bumps the thread's
//        last_message_at so it floats to the top of both inboxes.
//
// REALTIME: the conversation view POLLS this GET on a short interval (the mobile
// useThreadMessages hook uses refetchInterval; the web dashboard the same). No
// Supabase Realtime websocket infra is added — polling is sufficient for a low-volume
// owner↔provider channel and keeps the surface simple (documented in the ticket/PR).
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").

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
    const rawLimit = parseInt(searchParams.get("limit") ?? "30", 10);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 30, 1), 100);
    const before = searchParams.get("before");

    // Fetch limit+1 to compute hasMore without a second count query. NEWEST-first;
    // ?before= pages backwards (older than the given message id). RLS scopes the rows
    // to participants — an outsider gets nothing, so no manual participant check needed.
    const rows = before
      ? await sql`
          SELECT id, thread_id, sender_user_id, body, attachment_url, created_at, read_at
          FROM messages
          WHERE thread_id = ${threadId}
            AND id < ${before}
            AND hidden_at IS NULL
          ORDER BY id DESC
          LIMIT ${limit + 1}
        `
      : await sql`
          SELECT id, thread_id, sender_user_id, body, attachment_url, created_at, read_at
          FROM messages
          WHERE thread_id = ${threadId}
            AND hidden_at IS NULL
          ORDER BY id DESC
          LIMIT ${limit + 1}
        `;

    const hasMore = rows.length > limit;
    const messages = hasMore ? rows.slice(0, limit) : rows;
    return Response.json({ messages, hasMore });
  } catch (error) {
    console.error("[GET /api/threads/[id]/messages] Error:", error.message);
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
    const body = (await request.json()) ?? {};
    const text = typeof body.body === "string" ? body.body.trim() : null;
    const attachmentUrl =
      typeof body.attachment_url === "string" && body.attachment_url.length > 0
        ? body.attachment_url
        : null;

    // A message must carry something — mirrors the 0031 CHECK (clean 400, not a 500).
    if (!text && !attachmentUrl) {
      return Response.json(
        { error: "A message must have text or an attachment" },
        { status: 400 },
      );
    }

    // The INSERT is participant-gated by RLS (WITH CHECK: sender = caller AND caller is
    // a thread participant). A non-participant's insert raises an RLS error → 403. We
    // force sender_user_id = userId so a caller can only ever post AS themselves.
    let created;
    try {
      created = await sql`
        INSERT INTO messages (thread_id, sender_user_id, body, attachment_url)
        VALUES (${threadId}, ${userId}, ${text}, ${attachmentUrl})
        RETURNING id, thread_id, sender_user_id, body, attachment_url, created_at, read_at
      `;
    } catch (insertErr) {
      // RLS denial (non-participant / spoofed sender) surfaces as a 42501-class error.
      if (/row-level security|permission denied/i.test(insertErr.message)) {
        return Response.json(
          { error: "You are not a participant of this thread" },
          { status: 403 },
        );
      }
      throw insertErr;
    }

    // Float the thread to the top of both inboxes. RLS allows the participant to UPDATE
    // their own thread row; a no-op if somehow not visible.
    await sql`
      UPDATE message_threads SET last_message_at = now() WHERE id = ${threadId}
    `;

    return Response.json({ message: created[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/threads/[id]/messages] Error:", error.message);
    return Response.json({ error: "Failed to send message" }, { status: 500 });
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md).
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
