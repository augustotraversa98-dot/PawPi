import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// PATCH /api/care-access/invites/[inviteId] { action: 'revoke' } — the owner withdraws an invite link.
// 200 { invite: { id, status: 'revoked', revoked_at } } (also when it was already revoked); 409 'invite_used' once a
// vet used it (the owner then denies or ends that vet's access in /api/care-access/grants); 404 for anyone else's.
async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) ?? {};
    if (body.action !== "revoke") {
      return Response.json({ error: "action must be 'revoke'" }, { status: 400 });
    }

    const notFound = () => Response.json({ error: "Invite not found" }, { status: 404 });
    if (!/^\d{1,9}$/.test(String(params.inviteId))) return notFound();
    const inviteId = Number(params.inviteId);

    const revoked = await sql`
      UPDATE care_access_invites
      SET revoked_at = COALESCE(revoked_at, now())
      WHERE id = ${inviteId} AND owner_user_id = ${userId} AND used_at IS NULL
      RETURNING id, revoked_at
    `;
    if (revoked.length > 0) {
      return Response.json({ invite: { ...revoked[0], status: "revoked" } });
    }

    const existing = await sql`
      SELECT id FROM care_access_invites
      WHERE id = ${inviteId} AND owner_user_id = ${userId}
    `;
    if (existing.length === 0) return notFound();
    return Response.json(
      { error: "This invite was already used", code: "invite_used" },
      { status: 409 },
    );
  } catch (error) {
    console.error("[PATCH /api/care-access/invites/[inviteId]] Error:", error.message);
    return Response.json({ error: "Failed to update invite" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
