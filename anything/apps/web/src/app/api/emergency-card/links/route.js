import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/emergency-card/links — the OWNER creates a revocable vet link (ticket 2.51).
// scope: full|basic; expiry: 24h / 7d / no-expiry (ttlHours number or null). Owner-scoped:
// the INSERT's owner_user_id is the caller; RLS WITH CHECK rejects a forged owner.
//
// DB is porsager's tagged-template `sql`.

const SCOPES = ["full", "basic"];

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await request.json()) ?? {};
    const petId = body.petId;
    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }
    const scope = SCOPES.includes(body.scope) ? body.scope : "full";
    const ttlHours =
      body.ttlHours == null ? null : Number(body.ttlHours);
    if (ttlHours !== null && (!Number.isFinite(ttlHours) || ttlHours <= 0)) {
      return Response.json({ error: "Invalid ttlHours" }, { status: 400 });
    }

    const userProfile = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;
    if (userProfile.length === 0) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const ownerUserId = userProfile[0].id;

    // Verify ownership before issuing a link for the pet.
    const pet = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${ownerUserId}
    `;
    if (pet.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }

    const token = crypto.randomUUID().replace(/-/g, "");
    const expiresAt =
      ttlHours === null ? null : new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

    const created = await sql`
      INSERT INTO pet_emergency_share_links (pet_id, owner_user_id, token, scope, expires_at)
      VALUES (${petId}, ${ownerUserId}, ${token}, ${scope}, ${expiresAt})
      RETURNING id, token, scope, expires_at, created_at
    `;
    return Response.json({ link: created[0] }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/emergency-card/links] Error:", e?.message);
    return Response.json({ error: "Failed to create link" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
