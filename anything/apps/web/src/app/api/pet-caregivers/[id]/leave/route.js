import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { notifyPetShare, actorDisplayName } from "@/app/api/utils/petShareNotify";

// A member LEAVES a shared pet (family-sharing PR 4/7). Soft state: the grant becomes 'left' (left_at set, audit row written) and everything
// the member logged stays (it is anchored to the pet's owner). Access ends on the member's very next request. The owner is told once.
//   • an ACTIVE grant            -> leave_pet_caregiver() (migration 0142)  -> 200 { status: 'left' } + owner notified (`pet_share_left`)
//   • a still-PENDING invite     -> that is a decline, via respond_pet_caregiver() -> 200 { status: 'declined' } + owner notified
//   • already left/declined/revoked/expired, or called twice -> 200 { already: true } (idempotent, nothing re-sent)
//   • not the caller's grant / no such grant -> 404 `grant_not_found`
//   • migration 0142 not applied yet -> 503 `sharing_lifecycle_unavailable` (friendly, never a 500)

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
    if (!Number.isInteger(grantId)) {
      return Response.json({ error: "Invalid grant" }, { status: 400 });
    }

    const rows = await sql`
      SELECT pc.id, pc.status, pc.owner_user_id, pc.pet_id, p.name AS pet_name
      FROM pet_caregivers pc
      JOIN pets p ON p.id = pc.pet_id
      WHERE pc.id = ${grantId} AND pc.grantee_user_id = ${userId}
    `;
    if (rows.length === 0) {
      return Response.json({ error: "We couldn't find that shared dog.", code: "grant_not_found" }, { status: 404 });
    }
    const g = rows[0];

    if (!["active", "pending"].includes(g.status)) {
      return Response.json({ ok: true, already: true, status: g.status });
    }

    let status = null;
    try {
      await withSavepoint(async () => {
        const res =
          g.status === "active"
            ? await sql`SELECT leave_pet_caregiver(${grantId}) AS status`
            : await sql`SELECT respond_pet_caregiver(${grantId}, false) AS status`;
        status = res[0]?.status ?? null;
      });
    } catch (e) {
      if (e?.code === "42883") {
        // leave_pet_caregiver() does not exist yet (migration 0142 not applied)
        return Response.json(
          { error: "Leaving a shared dog isn't available yet. Please try again later.", code: "sharing_lifecycle_unavailable" },
          { status: 503 },
        );
      }
      if (/no (active|pending) grant/.test(String(e?.message))) {
        return Response.json({ ok: true, already: true }); // lost a race with another request that already ended it
      }
      throw e;
    }

    await notifyPetShare({
      type: status === "left" ? "pet_share_left" : "pet_share_declined",
      recipient: g.owner_user_id,
      actor: userId,
      petId: g.pet_id,
      petName: g.pet_name,
      actorName: await actorDisplayName(userId),
    });

    return Response.json({ ok: true, status });
  } catch (error) {
    console.error("[POST /api/pet-caregivers/[id]/leave] Error:", error.message);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
