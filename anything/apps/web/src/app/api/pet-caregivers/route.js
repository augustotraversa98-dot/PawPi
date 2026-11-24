import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { isBlockedBetween } from "@/app/api/utils/moderation";
import { notifyPetShare, actorDisplayName } from "@/app/api/utils/petShareNotify";
import { accessVersion } from "@/app/api/utils/petShareAccess";

// Family/caregiver sharing (ticket 2.47) — person↔person pet access grants.
//   GET ?petId=    → owner: who has access to my pet
//   GET ?mine=true → grantee: pets shared WITH me
//   POST           → owner invites a user (by username) as family|caregiver, optional expiry
//
// Scopes are derived from the role (stored for the record + future granularity); RLS gates by
// role via app_user_has_pet_family / app_user_has_pet_access.

const SCOPES_BY_ROLE = {
  family: ["profile", "routines", "health", "medical"],
  caregiver: ["profile", "routines", "medical"], // read-only feeding/med/emergency
};

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) return Response.json({ grants: [] });

    const { searchParams } = new URL(request.url);
    const mine = searchParams.get("mine") === "true";
    const petId = parseInt(searchParams.get("petId"));

    if (mine) {
      // Pets shared WITH me (as grantee).
      const grants = await sql`
        SELECT
          pc.id, pc.pet_id, pc.role, pc.scopes, pc.status, pc.expires_at, pc.created_at,
          p.name AS pet_name, p.avatar_url AS pet_avatar,
          owner.username AS owner_username
        FROM pet_caregivers pc
        JOIN pets p ON p.id = pc.pet_id
        JOIN user_profiles owner ON owner.id = pc.owner_user_id
        WHERE pc.grantee_user_id = ${userId}
          AND pc.status IN ('pending', 'active')
          -- An EXPIRED grant (active or still-pending) is not shown as "active" any more: access is already denied by the DB
          -- gates, and nothing flips status to 'expired', so filter on the clock here (audit gap B4).
          AND (pc.expires_at IS NULL OR pc.expires_at > now())
        ORDER BY pc.created_at DESC
      `;
      // `access_version` (additive): a fingerprint of the ACTIVE grants, so a client can notice a revoke/leave and drop its caches at once.
      const active = grants.filter((g) => g.status === "active");
      return Response.json({ grants, access_version: accessVersion(active) });
    }

    if (!Number.isInteger(petId)) {
      return Response.json({ error: "petId or mine=true required" }, { status: 400 });
    }

    // Owner: who has access to my pet. RLS already limits visibility to the owner/grantee;
    // the pet-ownership filter keeps it to the owner's view.
    const grants = await sql`
      SELECT
        pc.id, pc.pet_id, pc.role, pc.scopes,
        -- The owner sees the EFFECTIVE status: a grant whose expiry has passed is 'expired', never "active".
        CASE WHEN pc.status IN ('pending', 'active') AND pc.expires_at IS NOT NULL AND pc.expires_at <= now()
             THEN 'expired' ELSE pc.status END AS status,
        pc.expires_at, pc.created_at,
        (pc.status IN ('pending', 'active') AND pc.expires_at IS NOT NULL AND pc.expires_at <= now()) AS is_expired,
        grantee.username AS grantee_username, grantee.avatar_url AS grantee_avatar
      FROM pet_caregivers pc
      JOIN pets p ON p.id = pc.pet_id AND p.owner_user_id = ${userId}
      JOIN user_profiles grantee ON grantee.id = pc.grantee_user_id
      WHERE pc.pet_id = ${petId}
        AND pc.status <> 'declined'
      ORDER BY pc.created_at DESC
    `;
    return Response.json({ grants });
  } catch (error) {
    console.error("[GET /api/pet-caregivers] Error:", error.message);
    return Response.json({ error: "Failed to load grants" }, { status: 500 });
  }
}

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = await request.json();
    const petId = parseInt(body.petId);
    const role = body.role;
    const granteeUsername = (body.granteeUsername || "").trim();
    const granteeUserIdRaw = body.granteeUserId ? parseInt(body.granteeUserId) : null;
    const expiresAt = body.expiresAt || null; // ISO string or null

    if (!Number.isInteger(petId) || !["family", "caregiver"].includes(role)) {
      return Response.json({ error: "petId and a valid role are required" }, { status: 400 });
    }
    // An expiry, when given, must be a real moment in the future (a past or garbled date used to create a grant that never
    // worked, or a 500). Old builds never send one.
    if (expiresAt != null) {
      const when = new Date(expiresAt);
      if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
        return Response.json(
          { error: "Pick an expiry date in the future.", code: "invalid_expiry" },
          { status: 400 },
        );
      }
    }

    // Verify the caller owns the pet (RLS also enforces this on the insert).
    const pets = await sql`
      SELECT id, name FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (pets.length === 0) {
      return Response.json({ error: "Pet not found or not yours" }, { status: 403 });
    }

    // Resolve the grantee (by id or username).
    let granteeId = granteeUserIdRaw;
    if (!granteeId && granteeUsername) {
      const found = await sql`
        SELECT id FROM user_profiles WHERE username = ${granteeUsername} LIMIT 1
      `;
      if (found.length === 0) {
        return Response.json({ error: "User not found" }, { status: 404 });
      }
      granteeId = found[0].id;
    }
    if (!granteeId) {
      return Response.json({ error: "granteeUsername or granteeUserId required" }, { status: 400 });
    }
    if (granteeId === userId) {
      return Response.json({ error: "You already own this pet" }, { status: 400 });
    }

    // A blocked pair (either direction) cannot send access invites (flow audit F2-06).
    if (await isBlockedBetween(userId, granteeId)) {
      return Response.json({ error: "You can't interact with this user" }, { status: 403 });
    }

    const scopes = SCOPES_BY_ROLE[role];

    let created;
    try {
      // Savepoint: a unique violation caught below would otherwise abort the request transaction and
      // turn the friendly 409 into a blanket 500 at COMMIT.
      created = await withSavepoint(() => sql`
        INSERT INTO pet_caregivers
          (pet_id, owner_user_id, grantee_user_id, role, scopes, status, expires_at)
        VALUES (${petId}, ${userId}, ${granteeId}, ${role}, ${scopes}, 'pending', ${expiresAt})
        RETURNING *
      `);
    } catch (e) {
      // The partial unique index (one live grant per pet+grantee) → friendly 409.
      if (String(e.message).includes("idx_pet_caregivers_live_unique")) {
        return Response.json(
          { error: "This person already has a pending or active grant for this pet" },
          { status: 409 },
        );
      }
      throw e;
    }

    // Audit the grant issuance (owner is both actor + owner here).
    await sql`
      INSERT INTO pet_caregiver_audit (grant_id, owner_user_id, actor_user_id, action)
      VALUES (${created[0].id}, ${userId}, ${userId}, 'grant')
    `;

    // Tell the invitee (bell + optional push; one row, one recipient) and remember when — the timestamp rate-limits "resend invite".
    // Both are best-effort and savepoint-isolated: they can never fail the invite (the lifecycle columns come with migration 0142).
    await notifyPetShare({
      type: "pet_share_invite",
      recipient: granteeId,
      actor: userId,
      petId,
      petName: pets[0].name,
      actorName: await actorDisplayName(userId),
    });
    try {
      await withSavepoint(() => sql`UPDATE pet_caregivers SET last_notified_at = now() WHERE id = ${created[0].id}`);
    } catch (e) {
      if (e?.code !== "42703") throw e;
    }

    return Response.json({ grant: created[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/pet-caregivers] Error:", error.message);
    return Response.json({ error: "Failed to create grant" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
