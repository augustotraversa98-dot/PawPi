import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/blocks — real user→user blocking (Guideline 1.2, ticket T2). Thin routes over the 0065
// user_blocks table (RLS pins blocker = caller). Distinct from the pet-friendship 'blocked' state.
//   POST — block { blocked_user_id }. Idempotent: re-blocking a live pair returns the existing row.
//   GET  — the caller's live block list.
// Unblock (soft-delete) is DELETE /api/blocks/[id].
//
// DB is porsager's tagged-template `sql`.

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) ?? {};
    const blockedUserId = Number(body.blocked_user_id);
    if (!Number.isInteger(blockedUserId) || blockedUserId <= 0) {
      return Response.json({ error: "Invalid blocked_user_id" }, { status: 400 });
    }
    if (blockedUserId === userId) {
      return Response.json({ error: "You cannot block yourself" }, { status: 400 });
    }

    // Idempotency: a live block of the same pair is a no-op (the partial-unique index would 23505).
    const existing = await sql`
      SELECT * FROM user_blocks
      WHERE blocker_user_id = ${userId} AND blocked_user_id = ${blockedUserId}
        AND deleted_at IS NULL
      LIMIT 1
    `;
    if (existing.length > 0) {
      return Response.json({ block: existing[0], already_blocked: true }, { status: 200 });
    }

    const created = await sql`
      INSERT INTO user_blocks (blocker_user_id, blocked_user_id)
      VALUES (${userId}, ${blockedUserId})
      RETURNING *
    `;
    return Response.json({ block: created[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/blocks] Error:", error.message);
    return Response.json({ error: "Failed to block user" }, { status: 500 });
  }
}

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) return Response.json({ blocks: [] });

    const blocks = await sql`
      SELECT b.id, b.blocked_user_id, b.created_at,
             up.username AS blocked_username, up.full_name AS blocked_full_name
      FROM user_blocks b
      JOIN user_profiles up ON up.id = b.blocked_user_id
      WHERE b.blocker_user_id = ${userId} AND b.deleted_at IS NULL
      ORDER BY b.created_at DESC
    `;
    return Response.json({ blocks });
  } catch (error) {
    console.error("[GET /api/blocks] Error:", error.message);
    return Response.json({ error: "Failed to load blocks" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
