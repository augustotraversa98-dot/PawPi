import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Owner revokes a grant (ticket 2.47) — instant. Soft-revoke (status='revoked' + revoked_at)
// so the audit trail + the row survive; the access helpers stop counting it immediately. RLS
// (owner-only UPDATE) is the real guard; the WHERE owner filter keeps it to the owner's grant.

async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const grantId = parseInt(params.id);

    const revoked = await sql`
      UPDATE pet_caregivers
      SET status = 'revoked', revoked_at = now(), updated_at = now()
      WHERE id = ${grantId} AND owner_user_id = ${userId} AND status <> 'revoked'
      RETURNING id
    `;
    if (revoked.length === 0) {
      return Response.json({ error: "Not found or not yours" }, { status: 404 });
    }

    await sql`
      INSERT INTO pet_caregiver_audit (grant_id, owner_user_id, actor_user_id, action)
      VALUES (${grantId}, ${userId}, ${userId}, 'revoke')
    `;

    return Response.json({ ok: true, id: revoked[0].id });
  } catch (error) {
    console.error("[DELETE /api/pet-caregivers/[id]] Error:", error.message);
    return Response.json({ error: "Failed to revoke" }, { status: 500 });
  }
}

const wrappedDELETE = withRequestContext(DELETE);
export { wrappedDELETE as DELETE };
