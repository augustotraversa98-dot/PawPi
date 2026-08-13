import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/providers/[id]/walk-credits — the OWNER's remaining prepaid walk balance with this
// provider (Ticket B2). remaining = SUM(walks_total - walks_used) over the caller's ACTIVE credit
// packs for this provider (per owner↔provider, usable across the owner's pets). Owner-context: the
// walk_credit_packs owner-read RLS (0089) scopes it to the caller's own packs; no capability gate.
//
// Degrade clean: if walk_credit_packs is absent (unmigrated prod) → { remaining: 0 }. 404
// non-integer id before SQL.
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    if (!/^\d+$/.test(String(providerId))) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    let rows;
    try {
      rows = await sql`
        SELECT COALESCE(SUM(walks_total - walks_used), 0)::int AS remaining
        FROM walk_credit_packs
        WHERE owner_user_id = ${userId}
          AND provider_id = ${providerId}
          AND active = true
      `;
    } catch (e) {
      if (e?.code === "42P01" || /relation .* does not exist/i.test(e?.message ?? "")) {
        return Response.json({ remaining: 0 });
      }
      throw e;
    }

    return Response.json({ remaining: rows?.[0]?.remaining ?? 0 });
  } catch (e) {
    console.error("[GET /api/providers/[id]/walk-credits] Error:", e?.message);
    return Response.json({ error: "Failed to fetch walk credits" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
