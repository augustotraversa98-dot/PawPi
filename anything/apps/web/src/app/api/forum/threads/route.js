import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { moderationResponse } from "@/app/api/utils/moderateText";

// Community forum threads (ticket 2.44). GET = browse (category filter + hot/new/top sort,
// paginated); POST = create a thread. Any authed user can read; the author owns the row.

const PAGE = 20;
const SORTS = new Set(["hot", "new", "top"]);

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) return Response.json({ threads: [] });

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const sort = SORTS.has(searchParams.get("sort"))
      ? searchParams.get("sort")
      : "hot";
    const page = Math.max(0, parseInt(searchParams.get("page")) || 0);
    const offset = page * PAGE;

    // hot = score then recency; new = recency; top = score. "hot" keeps it simple
    // (score desc, then newest) — no decay function needed for launch.
    const order =
      sort === "new"
        ? sql`t.created_at DESC`
        : sort === "top"
          ? sql`t.score DESC, t.created_at DESC`
          : sql`t.score DESC, t.created_at DESC`;

    const threads = await sql`
      SELECT
        t.id, t.category, t.title, t.body, t.image_urls, t.score, t.created_at,
        t.author_user_id,
        up.username AS author_username,
        up.avatar_url AS author_avatar,
        (
          SELECT COUNT(*) FROM forum_comments c
          WHERE c.thread_id = t.id AND c.deleted_at IS NULL
        ) AS comment_count,
        (
          SELECT v.value FROM forum_votes v
          WHERE v.target_type = 'thread' AND v.target_id = t.id
            AND v.user_id = ${userId}
        ) AS my_vote
      FROM forum_threads t
      JOIN user_profiles up ON up.id = t.author_user_id
      WHERE t.deleted_at IS NULL
        -- Moderation (T3): hide threads removed by us + threads from a blocked user.
        AND t.hidden_at IS NULL
        AND NOT app_user_is_blocked(${userId}, t.author_user_id)
        ${category ? sql`AND t.category = ${category}` : sql``}
      ORDER BY ${order}
      LIMIT ${PAGE} OFFSET ${offset}
    `;

    return Response.json({ threads, page, sort });
  } catch (error) {
    console.error("[GET /api/forum/threads] Error:", error.message);
    return Response.json({ error: "Failed to load threads" }, { status: 500 });
  }
}

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
    const title = (body.title || "").trim();
    const category = (body.category || "General").trim() || "General";
    const text = (body.body || "").trim() || null;
    const imageUrls = Array.isArray(body.imageUrls)
      ? body.imageUrls.filter((u) => typeof u === "string")
      : [];

    if (!title) {
      return Response.json({ error: "Title is required" }, { status: 400 });
    }

    // Content filter (T7): reject objectionable title/body text before insert.
    const blocked = moderationResponse(title, text);
    if (blocked) return blocked;

    const result = await sql`
      INSERT INTO forum_threads (author_user_id, category, title, body, image_urls)
      VALUES (${userId}, ${category}, ${title}, ${text}, ${imageUrls})
      RETURNING *
    `;

    return Response.json({ thread: result[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/forum/threads] Error:", error.message);
    return Response.json({ error: "Failed to create thread" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
