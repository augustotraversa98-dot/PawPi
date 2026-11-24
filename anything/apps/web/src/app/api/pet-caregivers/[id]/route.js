import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { notifyPetShare, actorDisplayName } from "@/app/api/utils/petShareNotify";

// Owner revokes a grant (ticket 2.47) — instant. Soft-revoke (status='revoked' + revoked_at) so the audit trail + the row survive; the access
// helpers stop counting it on the very next statement, so the member's next request is denied immediately (no cache window on the server).
// RLS (owner-only UPDATE) is the real guard; the WHERE owner filter keeps it to the owner's grant.
//
// PR 4: IDEMPOTENT (revoking something already ended is a 200 `already`, not a 404 error alert — the owner's list still shows ended rows),
// and an ACTIVE member is told (bell + optional push, once, only on the real transition). Cancelling a still-pending invite is silent.

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
    if (!Number.isInteger(grantId)) {
      return Response.json({ error: "Invalid grant" }, { status: 400 });
    }

    const found = await sql`
      SELECT pc.id, pc.status, pc.grantee_user_id, pc.pet_id, p.name AS pet_name
      FROM pet_caregivers pc
      JOIN pets p ON p.id = pc.pet_id
      WHERE pc.id = ${grantId} AND pc.owner_user_id = ${userId}
    `;
    if (found.length === 0) {
      return Response.json({ error: "Not found or not yours", code: "grant_not_found" }, { status: 404 });
    }
    const g = found[0];
    if (!["pending", "active"].includes(g.status)) {
      // already ended (revoked / declined / left / expired): nothing to do, nothing to tell anyone
      return Response.json({ ok: true, id: g.id, already: true, status: g.status });
    }

    const revoked = await sql`
      UPDATE pet_caregivers
      SET status = 'revoked', revoked_at = now(), updated_at = now()
      WHERE id = ${grantId} AND owner_user_id = ${userId} AND status IN ('pending', 'active')
      RETURNING id
    `;
    if (revoked.length === 0) {
      // lost a race with another request that already ended it
      return Response.json({ ok: true, id: g.id, already: true });
    }

    await sql`
      INSERT INTO pet_caregiver_audit (grant_id, owner_user_id, actor_user_id, action)
      VALUES (${grantId}, ${userId}, ${userId}, 'revoke')
    `;

    if (g.status === "active") {
      await notifyPetShare({
        type: "pet_share_revoked",
        recipient: g.grantee_user_id,
        actor: userId,
        petId: g.pet_id,
        petName: g.pet_name,
        actorName: await actorDisplayName(userId),
      });
    }

    return Response.json({ ok: true, id: revoked[0].id });
  } catch (error) {
    console.error("[DELETE /api/pet-caregivers/[id]] Error:", error.message);
    return Response.json({ error: "Failed to revoke" }, { status: 500 });
  }
}

const wrappedDELETE = withRequestContext(DELETE);
export { wrappedDELETE as DELETE };
