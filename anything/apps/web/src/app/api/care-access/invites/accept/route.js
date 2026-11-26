import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { enforceRateLimit } from "@/app/api/utils/rateLimit";
import {
  VET_INVITE_REQUEST_SCOPES,
  hashInviteToken,
  inviteBusinesses,
  inviteNotValid,
  isInviteToken,
  noVetBusiness,
  notifyOwnerOfAccessRequest,
} from "@/app/api/utils/vetInvite";

// Thrown inside the savepoint so that the claim is undone and the invite stays usable.
class AlreadyOpen extends Error {
  constructor(petName) {
    super("already open");
    this.petName = petName;
  }
}

// Uses the invite and files the PENDING request, both or neither. The insert goes through the ordinary
// care_access_grants policy for provider staff, which only admits a pending request without sections.
// Returns null when the invite is not usable.
async function claimAndRequest(tokenHash, providerId) {
  return await withSavepoint(async () => {
    const claimed = await sql`
      SELECT pet_id, owner_user_id, pet_name
      FROM app_claim_vet_invite(${tokenHash}, ${providerId}::int)
    `;
    if (claimed.length === 0) return null;
    const { pet_id: petId, owner_user_id: ownerUserId, pet_name: petName } = claimed[0];

    // The same lock the owner's share takes (grants route): one change at a time per pet and provider.
    await sql`SELECT pg_advisory_xact_lock(hashtext(${`care_access_grant:${petId}:${providerId}`}))`;
    await sql`SELECT app_expire_care_grants(${petId}::int, ${providerId}::int)`;
    const open = await sql`
      SELECT id FROM care_access_grants
      WHERE pet_id = ${petId}
        AND provider_id = ${providerId}
        AND status IN ('pending', 'active')
      LIMIT 1
    `;
    if (open.length > 0) throw new AlreadyOpen(petName);

    const created = await sql`
      INSERT INTO care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by)
      VALUES (
        ${petId},
        ${ownerUserId},
        ${providerId},
        ${VET_INVITE_REQUEST_SCOPES},
        ${"pending"},
        ${"provider"}
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    if (created.length === 0) throw new AlreadyOpen(petName);

    return { ownerUserId, petName };
  });
}

// POST /api/care-access/invites/accept { token, providerId } — a vet accepts an invite for one of their businesses.
// It opens NOTHING: it creates a pending access request that the owner approves or denies.
//   200 { status: 'requested' | 'already_open', petName } ('already_open' leaves the invite unused)
//   401 · 403 'no_business' | 'not_allowed' · 404 'invite_not_valid' · 429
async function POST(request) {
  try {
    const session = await auth();
    const userId = session?.user?.id ? await resolveUserId(session.user.id) : null;

    const limited = await enforceRateLimit("vet_invite_accept", request, { userId });
    if (limited) return limited;

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const businesses = userId === null ? [] : await inviteBusinesses(userId);
    if (businesses.length === 0) return noVetBusiness();

    const body = (await request.json().catch(() => null)) ?? {};
    const business = businesses.find((b) => String(b.id) === String(body.providerId));
    if (!business) {
      return Response.json(
        { error: "Not authorized for this business", code: "not_allowed" },
        { status: 403 },
      );
    }
    if (!isInviteToken(body.token)) return inviteNotValid();

    let result;
    try {
      result = await claimAndRequest(hashInviteToken(body.token), business.id);
    } catch (e) {
      if (!(e instanceof AlreadyOpen)) throw e;
      return Response.json({ status: "already_open", petName: e.petName });
    }
    if (result === null) return inviteNotValid();

    await notifyOwnerOfAccessRequest({
      ownerUserId: result.ownerUserId,
      staffUserId: userId,
      providerName: business.name,
      petName: result.petName,
    });

    return Response.json({ status: "requested", petName: result.petName });
  } catch (error) {
    console.error("[POST /api/care-access/invites/accept] Error:", error.message);
    return Response.json({ error: "Failed to accept the invite" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
