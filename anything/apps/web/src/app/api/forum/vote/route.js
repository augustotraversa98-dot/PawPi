import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Cast / change / clear a vote on a forum thread or comment (ticket 2.44). Idempotent:
// value 1 (up), -1 (down), 0 (clear). All the work — upsert the caller's single vote row +
// recompute the target's score — happens in the forum_vote() SECURITY DEFINER helper, so a
// non-author voter can still move a score that author-only RLS would otherwise block.

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

    const body = await request.json();
    const targetType = body.targetType;
    const targetId = parseInt(body.targetId);
    const value = parseInt(body.value);

    if (!["thread", "comment"].includes(targetType) || !Number.isInteger(targetId)) {
      return Response.json({ error: "Invalid target" }, { status: 400 });
    }
    if (![-1, 0, 1].includes(value)) {
      return Response.json({ error: "Invalid value" }, { status: 400 });
    }

    const rows = await sql`
      SELECT forum_vote(${targetType}, ${targetId}, ${value}) AS score
    `;

    return Response.json({ score: rows[0].score, myVote: value === 0 ? null : value });
  } catch (error) {
    console.error("[POST /api/forum/vote] Error:", error.message);
    return Response.json({ error: "Failed to vote" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
