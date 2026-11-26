import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { enforceRateLimit } from "@/app/api/utils/rateLimit";
import { resolveAppOrigin } from "@/app/api/utils/passwordResetToken";
import {
  VET_INVITE_OPEN_LIMIT,
  VET_INVITE_TTL_DAYS,
  hashInviteToken,
  inviteLink,
  newInviteToken,
} from "@/app/api/utils/vetInvite";

// The OWNER's invite links for a vet (migration 0148, docs/vet-sharing-design.md "Invite by link"). OWNER-context
// like /api/care-access/grants: only the pet's owner (not family members) creates one, and only sees their own.

// GET /api/care-access/invites?petId= → { invites }, newest first. Never returns a token or a link.
// `status`: 'open' | 'used' | 'revoked' | 'expired'.
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const raw = new URL(request.url).searchParams.get("petId");
    if (raw !== null && !/^\d{1,9}$/.test(raw)) {
      return Response.json({ error: "petId must be a number" }, { status: 400 });
    }
    const petId = raw === null ? null : Number(raw);

    const invites = await sql`
      SELECT
        i.id,
        i.pet_id,
        p.name AS pet_name,
        CASE
          WHEN i.used_at IS NOT NULL THEN 'used'
          WHEN i.revoked_at IS NOT NULL THEN 'revoked'
          WHEN i.expires_at <= now() THEN 'expired'
          ELSE 'open'
        END AS status,
        i.created_at,
        i.expires_at,
        i.used_at,
        i.revoked_at,
        pr.name AS used_by_provider_name
      FROM care_access_invites i
      LEFT JOIN pets p ON p.id = i.pet_id
      LEFT JOIN providers pr ON pr.id = i.used_by_provider_id
      WHERE i.owner_user_id = ${userId}
        AND (${petId}::int IS NULL OR i.pet_id = ${petId}::int)
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT 50
    `;

    return Response.json({ invites });
  } catch (error) {
    console.error("[GET /api/care-access/invites] Error:", error.message);
    return Response.json({ error: "Failed to fetch invites" }, { status: 500 });
  }
}

// POST /api/care-access/invites { petId } → 201 { invite, link }. The link is returned here and never again.
// At most VET_INVITE_OPEN_LIMIT usable invites per owner (409 'invite_limit').
async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const limited = await enforceRateLimit("vet_invite_create", request, { userId });
    if (limited) return limited;

    const body = (await request.json().catch(() => null)) ?? {};
    const petId = Number(body.petId);
    if (!Number.isInteger(petId) || petId <= 0 || petId > 2147483647) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    const petRows = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (petRows.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }

    // One creation at a time per owner, so the limit holds under concurrent requests.
    await sql`SELECT pg_advisory_xact_lock(hashtext(${`care_access_invite:${userId}`}))`;
    const open = await sql`
      SELECT count(*)::int AS n FROM care_access_invites
      WHERE owner_user_id = ${userId}
        AND used_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > now()
    `;
    if (open[0].n >= VET_INVITE_OPEN_LIMIT) {
      return Response.json(
        {
          error: "You have too many open invites. Withdraw one to create another.",
          code: "invite_limit",
          limit: VET_INVITE_OPEN_LIMIT,
        },
        { status: 409 },
      );
    }

    const token = newInviteToken();
    const created = await sql`
      INSERT INTO care_access_invites (pet_id, owner_user_id, token_hash, expires_at)
      VALUES (
        ${petId},
        ${userId},
        ${hashInviteToken(token)},
        now() + make_interval(days => ${VET_INVITE_TTL_DAYS})
      )
      RETURNING id, pet_id, created_at, expires_at
    `;

    return Response.json(
      {
        invite: { ...created[0], status: "open" },
        link: inviteLink(resolveAppOrigin(request), token),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[POST /api/care-access/invites] Error:", error.message);
    return Response.json({ error: "Failed to create invite" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
