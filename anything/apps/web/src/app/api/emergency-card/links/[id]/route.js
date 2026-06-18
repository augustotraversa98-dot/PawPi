import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { withRequestContext } from "@/app/api/utils/requestContext";

// DELETE /api/emergency-card/links/[id] — the OWNER revokes a vet link instantly (ticket 2.51).
// Soft revoke (revoked_at = now()) so the audit trail survives; the public reader
// (app_emergency_card_by_link) returns ZERO for a revoked link immediately. Owner-scoped: the
// owner_user_id WHERE + RLS mean a non-owner revokes ZERO rows → 404.

async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const linkId = params.id;
    const userProfile = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;
    if (userProfile.length === 0) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const ownerUserId = userProfile[0].id;

    const revoked = await sql`
      UPDATE pet_emergency_share_links
      SET revoked_at = now()
      WHERE id = ${linkId} AND owner_user_id = ${ownerUserId} AND revoked_at IS NULL
      RETURNING id
    `;
    if (revoked.length === 0) {
      return Response.json({ error: "Link not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/emergency-card/links/[id]] Error:", e?.message);
    return Response.json({ error: "Failed to revoke link" }, { status: 500 });
  }
}

const wrappedDELETE = withRequestContext(DELETE);
export { wrappedDELETE as DELETE };
