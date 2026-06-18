import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/saved-places — the owner's personal favorites (Wave 7 ticket 2.73).
//   GET  — the owner's saved places (RLS owner_all), newest first.
//   POST — save a place (idempotent on (owner, place_id)). Only owner-scoped data; no provider spine.
//
// DB is porsager's tagged-template `sql`.
async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const rows = await sql`
      SELECT id, place_id, name, category, lat, lng, address, created_at
      FROM saved_places
      WHERE owner_user_id = ${userId}
      ORDER BY created_at DESC, id DESC
    `;
    return Response.json({ places: rows });
  } catch (e) {
    console.error("[GET /api/saved-places] Error:", e?.message);
    return Response.json({ error: "Failed to load saved places" }, { status: 500 });
  }
}

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
    const body = (await request.json()) ?? {};
    const { place_id, name, category, lat, lng, address, raw } = body;
    if (!place_id || !name) {
      return Response.json(
        { error: "place_id and name are required" },
        { status: 400 },
      );
    }
    // Idempotent: a repeat save updates the cached fields rather than erroring.
    const saved = await sql`
      INSERT INTO saved_places
        (owner_user_id, place_id, name, category, lat, lng, address, raw)
      VALUES (
        ${userId}, ${place_id}, ${name}, ${category ?? null},
        ${lat ?? null}, ${lng ?? null}, ${address ?? null},
        ${raw ? JSON.stringify(raw) : "{}"}::jsonb
      )
      ON CONFLICT (owner_user_id, place_id)
      DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category,
        lat = EXCLUDED.lat, lng = EXCLUDED.lng, address = EXCLUDED.address
      RETURNING id, place_id, name, category, lat, lng, address, created_at
    `;
    return Response.json({ place: saved[0] }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/saved-places] Error:", e?.message);
    return Response.json({ error: "Failed to save place" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
