import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { enforceRateLimit } from "@/app/api/utils/rateLimit";
import {
  hashInviteToken,
  inviteBusinesses,
  inviteNotValid,
  isInviteToken,
  noVetBusiness,
} from "@/app/api/utils/vetInvite";

// POST /api/care-access/invites/preview { token } — what an invited vet sees before accepting: the pet's name, the
// owner's display name and the expiry, plus the caller's businesses that may accept. No photo, no record data.
// POST so the token travels in the body, never in a URL.
//   401 signed out · 403 'no_business' (decided before the token is looked at) · 404 'invite_not_valid' (one answer
//   for every unusable link) · 429.
async function POST(request) {
  try {
    const session = await auth();
    const userId = session?.user?.id ? await resolveUserId(session.user.id) : null;

    const limited = await enforceRateLimit("vet_invite_open", request, { userId });
    if (limited) return limited;

    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const businesses = userId === null ? [] : await inviteBusinesses(userId);
    if (businesses.length === 0) return noVetBusiness();

    const body = (await request.json().catch(() => null)) ?? {};
    if (!isInviteToken(body.token)) return inviteNotValid();

    const rows = await sql`
      SELECT pet_name, owner_name, expires_at
      FROM app_preview_vet_invite(${hashInviteToken(body.token)})
    `;
    if (rows.length === 0) return inviteNotValid();

    return Response.json(
      {
        invite: {
          petName: rows[0].pet_name,
          ownerName: rows[0].owner_name,
          expiresAt: rows[0].expires_at,
        },
        businesses: businesses.map((b) => ({ id: b.id, name: b.name })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[POST /api/care-access/invites/preview] Error:", error.message);
    return Response.json({ error: "Failed to open the invite" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
