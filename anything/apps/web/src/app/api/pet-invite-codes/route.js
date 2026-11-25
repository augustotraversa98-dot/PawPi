import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { withRateLimit } from "@/app/api/utils/rateLimit";
import {
  generateInviteCode,
  normalizeInviteCode,
  hashInviteCode,
  CODE_TTL_HOURS,
  MAX_LIVE_CODES_PER_PET,
} from "@/app/api/utils/inviteCodes";

// The OWNER's invite codes for one pet (docs/pr6-invite-code-design.md).
//   GET  ?petId=            -> the live codes (never the code itself: only its hash exists)
//   POST { petId, role }    -> a new code, returned ONCE in this response
// The code is never logged: errors log the database message only, and the access log carries no body.

const NO_STORE = { "Cache-Control": "no-store" };
const unavailable = () =>
  Response.json(
    { error: "Invite codes aren't available yet. Please try again later.", code: "invite_codes_unavailable" },
    { status: 503 },
  );

async function ownedPet(userId, petId) {
  const rows = await sql`SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}`;
  return rows[0] ?? null;
}

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const userId = await resolveUserId(session.user.id);
    const petId = parseInt(new URL(request.url).searchParams.get("petId"));
    if (!Number.isInteger(petId)) return Response.json({ error: "petId is required" }, { status: 400 });
    if (!userId || !(await ownedPet(userId, petId))) {
      return Response.json({ error: "Pet not found or not yours" }, { status: 403 });
    }
    try {
      const invites = await withSavepoint(
        () => sql`
          SELECT id, pet_id, role, expires_at, created_at
          FROM pet_invite_codes
          WHERE pet_id = ${petId} AND owner_user_id = ${userId}
            AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
          ORDER BY created_at DESC, id DESC
        `,
      );
      return Response.json({ invites }, { headers: NO_STORE });
    } catch (e) {
      if (e?.code === "42P01") return unavailable();
      throw e;
    }
  } catch (error) {
    console.error("[GET /api/pet-invite-codes] Error:", error.message);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const userId = await resolveUserId(session.user.id);
    const body = await request.json().catch(() => ({}));
    const petId = parseInt(body?.petId);
    const role = body?.role;
    if (!Number.isInteger(petId) || !["family", "caregiver"].includes(role)) {
      return Response.json({ error: "petId and a valid role are required" }, { status: 400 });
    }
    if (!userId || !(await ownedPet(userId, petId))) {
      return Response.json({ error: "Pet not found or not yours" }, { status: 403 });
    }

    const code = generateInviteCode();
    const codeHash = hashInviteCode(normalizeInviteCode(code));
    try {
      const live = await withSavepoint(
        () => sql`
          SELECT count(*)::int AS n FROM pet_invite_codes
          WHERE pet_id = ${petId} AND owner_user_id = ${userId}
            AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
        `,
      );
      if ((live[0]?.n ?? 0) >= MAX_LIVE_CODES_PER_PET) {
        return Response.json(
          { error: "You have several codes waiting. Remove one before creating another.", code: "too_many_codes" },
          { status: 409 },
        );
      }
      const created = await withSavepoint(
        () => sql`
          INSERT INTO pet_invite_codes (pet_id, owner_user_id, role, code_hash, expires_at)
          VALUES (${petId}, ${userId}, ${role}, ${codeHash}, now() + make_interval(hours => ${CODE_TTL_HOURS}))
          RETURNING id, pet_id, role, expires_at, created_at
        `,
      );
      return Response.json({ code, invite: created[0] }, { status: 201, headers: NO_STORE });
    } catch (e) {
      if (e?.code === "42P01") return unavailable();
      throw e;
    }
  } catch (error) {
    console.error("[POST /api/pet-invite-codes] Error:", error.message);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(withRateLimit("invite_create", POST));
export { wrappedGET as GET, wrappedPOST as POST };
