import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/payments/[id] — fetch a single payment, OWNER-or-PROVIDER scoped (ticket 2.3).
// Visibility mirrors the payments RLS: the order's paying owner OR active staff of the
// provider being paid can read it; nobody else. We resolve the caller's user_profiles.id
// and select with an explicit scope WHERE so the route is correct even before the RLS
// cutover (defense in depth — the DB policy also enforces it once 0029 is applied).
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

    const paymentId = params.id;

    // Owner OR active provider-staff of the order's provider may read. The join to
    // provider_staff resolves the provider scope; a removed/invited membership returns
    // no row, exactly like the RLS policy.
    const rows = await sql`
      SELECT p.*, o.owner_user_id, o.provider_id, o.kind, o.status AS order_status
      FROM payments p
      JOIN orders o ON o.id = p.order_id
      WHERE p.id = ${paymentId}
        AND (
          o.owner_user_id = ${userId}
          OR EXISTS (
            SELECT 1 FROM provider_staff ps
            WHERE ps.provider_id = o.provider_id
              AND ps.user_profile_id = ${userId}
              AND ps.status = 'active'
          )
        )
      LIMIT 1
    `;

    if (rows.length === 0) {
      // Not found OR not visible to this caller — same response (don't leak existence).
      return Response.json({ error: "Payment not found" }, { status: 404 });
    }

    return Response.json({ payment: rows[0] });
  } catch (error) {
    console.error("[GET /api/payments/[id]] Error:", error.message);
    return Response.json({ error: "Failed to fetch payment" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
