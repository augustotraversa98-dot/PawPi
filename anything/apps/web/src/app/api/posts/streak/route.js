import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

/**
 * GET /api/posts/streak?petId=<id>
 *
 * Returns the recent DAILY-post day strings for a pet (ticket 2.37). The client
 * computes the consecutive-day streak from these against ITS local day, so the
 * day boundary stays the viewer's — no server timezone guessing.
 *
 * Posts are authed-readable (RLS), so any signed-in user may read a pet's
 * posting cadence (same data the feed already exposes). Capped to the last 400
 * distinct daily days, newest first — far more than any real streak needs.
 *
 * Returns: { dailyPostDates: string[] }  (each "YYYY-MM-DD")
 */
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const petId = parseInt(searchParams.get("petId") ?? "", 10);
    if (!Number.isInteger(petId)) {
      return Response.json({ error: "Invalid petId" }, { status: 400 });
    }

    const rows = await sql`
      SELECT DISTINCT post_date
      FROM posts
      WHERE pet_id = ${petId}
        AND is_daily_update = true
      ORDER BY post_date DESC
      LIMIT 400
    `;

    // Normalize to YYYY-MM-DD strings (post_date is a DATE; the driver may hand
    // back a Date or a string depending on column type).
    const dailyPostDates = rows.map((r) => {
      const d = r.post_date;
      if (d instanceof Date) return d.toISOString().slice(0, 10);
      return String(d).slice(0, 10);
    });

    return Response.json({ dailyPostDates });
  } catch (error) {
    console.error("[GET /api/posts/streak] ERROR:", error.message);
    return Response.json({ error: "Failed to load streak" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
