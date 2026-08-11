import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/providers/following — the businesses the current user follows (ticket 2.92). A STATIC
// sibling of /api/providers/[id]; the route-builder's specificity sort (static before [param],
// fixed in #336) matches this before [id] would capture "following" as an id — proven by the 2.92
// URL-level test hitting this path via the real router.
//
// Projects ONLY public provider fields (never provider-private data). DEGRADES CLEANLY: while the
// provider_follows table (0083) is not yet applied, an undefined_table error (42P01) returns an
// empty list rather than 500. RLS (0083): the caller reads their OWN follow edges.

const isMissingTable = (e) => e?.code === "42P01";

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

    try {
      const providers = await sql`
        SELECT
          p.id, p.name, p.slug, p.logo_url, p.provider_type, p.status,
          pf.created_at AS followed_at
        FROM provider_follows pf
        JOIN providers p ON p.id = pf.provider_id
        WHERE pf.follower_user_id = ${userId}
        ORDER BY pf.created_at DESC
      `;
      return Response.json({ providers });
    } catch (e) {
      if (isMissingTable(e)) return Response.json({ providers: [] }); // pre-migration → empty
      throw e;
    }
  } catch (e) {
    console.error("[GET /api/providers/following] Error:", e?.message);
    return Response.json({ error: "Failed to load followed businesses" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
