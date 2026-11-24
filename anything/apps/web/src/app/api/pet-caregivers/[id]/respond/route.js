import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { notifyPetShare, actorDisplayName } from "@/app/api/utils/petShareNotify";

// The grantee accepts or declines a pending grant (ticket 2.47). The state change happens in the respond_pet_caregiver() SECURITY DEFINER helper
// (the grantee cannot touch role/scopes), but the route decides EVERYTHING it can before calling it, and calls it inside a SAVEPOINT:
//   • a grant that is not the caller's (wrong account) or does not exist  -> 404 `invite_not_found`, and the function is never called
//   • the same answer twice (double tap)                                   -> 200 `already`, ONE state change, ONE notification
//   • a grant that is no longer pending (revoked / left / declined…)       -> 404 `invite_not_pending`
//   • an expired pending invite                                            -> 410 `invite_expired`
//   • the race where it stopped being pending between the lookup and the call -> the function's RAISE is rolled back to the savepoint and
//     answered 404 (it used to abort the whole request transaction and surface as a blanket 500 — audit B9).
// A real transition tells the OWNER once (accepted / declined).

async function POST(request, { params }) {
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
    const body = await request.json().catch(() => ({}));
    const accept = body?.accept === true;
    if (!Number.isInteger(grantId)) {
      return Response.json({ error: "Invalid grant" }, { status: 400 });
    }

    // The grantee can read their own grants under RLS, so a grant that is not theirs simply is not found.
    const rows = await sql`
      SELECT pc.id, pc.status, pc.expires_at, pc.owner_user_id, pc.pet_id, p.name AS pet_name
      FROM pet_caregivers pc
      JOIN pets p ON p.id = pc.pet_id
      WHERE pc.id = ${grantId} AND pc.grantee_user_id = ${userId}
    `;
    if (rows.length === 0) {
      return Response.json({ error: "This invitation isn't available anymore.", code: "invite_not_found" }, { status: 404 });
    }
    const g = rows[0];

    const wanted = accept ? "active" : "declined";
    if (g.status === wanted) {
      return Response.json({ status: wanted, already: true });
    }
    if (g.status !== "pending") {
      return Response.json({ error: "This invitation isn't available anymore.", code: "invite_not_pending" }, { status: 404 });
    }
    if (g.expires_at && new Date(g.expires_at).getTime() <= Date.now()) {
      return Response.json({ error: "This invitation has expired.", code: "invite_expired" }, { status: 410 });
    }

    let status = null;
    try {
      await withSavepoint(async () => {
        const res = await sql`SELECT respond_pet_caregiver(${grantId}, ${accept}) AS status`;
        status = res[0]?.status ?? null;
      });
    } catch (e) {
      if (String(e?.message).includes("no pending grant")) {
        return Response.json({ error: "This invitation isn't available anymore.", code: "invite_not_pending" }, { status: 404 });
      }
      throw e;
    }

    await notifyPetShare({
      type: accept ? "pet_share_accepted" : "pet_share_declined",
      recipient: g.owner_user_id,
      actor: userId,
      petId: g.pet_id,
      petName: g.pet_name,
      actorName: await actorDisplayName(userId),
    });

    return Response.json({ status });
  } catch (error) {
    console.error("[POST /api/pet-caregivers/[id]/respond] Error:", error.message);
    return Response.json({ error: "Failed to respond" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
