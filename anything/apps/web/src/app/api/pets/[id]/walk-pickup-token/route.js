import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import {
  signPickupToken,
  PICKUP_TOKEN_TTL_SECONDS,
} from "@/app/api/utils/walkPickupToken";

// GET /api/pets/[id]/walk-pickup-token?provider_id= — the OWNER mints a short-lived signed token
// to render as a QR at pickup (Ticket B3). Owner-context: the caller must OWN the pet. The token
// binds { owner_user_id, pet_id, provider_id, exp } and is verified server-side on the walker's
// scan (POST .../walk-pickup/redeem). No table — the token is stateless HMAC-signed.
//
// 404 non-integer pet id before SQL. 400 for a missing/invalid provider_id.
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const petId = params.id;
    if (!/^\d+$/.test(String(petId))) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const providerIdRaw = searchParams.get("provider_id");
    const providerId = parseInt(providerIdRaw ?? "", 10);
    if (!Number.isInteger(providerId)) {
      return Response.json({ error: "provider_id is required" }, { status: 400 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // The caller must OWN the pet — the token is a handover proof for THEIR pet.
    const petRows = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (petRows.length === 0) {
      return Response.json({ error: "Pet not found or access denied" }, { status: 403 });
    }

    const now = Date.now();
    const token = signPickupToken(
      { owner_user_id: userId, pet_id: Number(petId), provider_id: providerId },
      { now },
    );
    const expiresAt = new Date(now + PICKUP_TOKEN_TTL_SECONDS * 1000).toISOString();

    return Response.json({ token, expires_at: expiresAt, ttl_seconds: PICKUP_TOKEN_TTL_SECONDS });
  } catch (e) {
    console.error("[GET /api/pets/[id]/walk-pickup-token] Error:", e?.message);
    return Response.json({ error: "Failed to create pickup token" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
