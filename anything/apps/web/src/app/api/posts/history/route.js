import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// A pet's own daily-post history (ticket 2.49 — Memories "On this day" + Wrapped). Read-only
// over the public daily posts (image + date). Any signed-in user may read a pet's daily
// history (same any-authed visibility as the feed); the client aggregates "on this day".
//
// GET /api/posts/history?petId=<id>  → { posts: [{ id, image_url, caption, post_date }] }

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const petId = parseInt(searchParams.get("petId"));
    if (!Number.isInteger(petId)) {
      return Response.json({ error: "Invalid petId" }, { status: 400 });
    }

    const rows = await sql`
      SELECT id, image_url, caption, post_date
      FROM posts
      WHERE pet_id = ${petId}
        AND is_daily_update = true
        AND image_url IS NOT NULL
      ORDER BY post_date DESC
      LIMIT 500
    `;

    // Normalize post_date (a DATE) to a YYYY-MM-DD string for the TZ-safe client helpers.
    const posts = rows.map((r) => {
      const d = r.post_date;
      const post_date =
        d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
      return { id: r.id, image_url: r.image_url, caption: r.caption, post_date };
    });

    return Response.json({ posts });
  } catch (error) {
    console.error("[GET /api/posts/history] Error:", error.message);
    return Response.json({ error: "Failed to load history" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
