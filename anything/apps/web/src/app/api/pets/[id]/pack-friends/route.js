import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { listPackFriends } from "@/app/api/utils/packFriends";

// GET /api/pets/[id]/pack-friends?q=…
//
// The friend picker behind "Streak with a friend": this pet's FRIENDS (accepted friendship or mutual
// follow, see utils/packFriends) whose pet name, @handle or owner name match `q`. With no `q` it
// returns the first few friends alphabetically so the picker can open pre-populated. Each row carries
// `pack_status` ("none" | "pending" | "active" | "ended") so the picker can disable a dog that
// already has a pack with this pet. Public fields only: id, name, handle, avatar_url, owner_name.
const isIntId = (v) => Number.isInteger(v) || /^\d+$/.test(String(v ?? ""));

async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!isIntId(params.id)) return Response.json({ error: "Pet not found" }, { status: 404 });

    const ownerUserId = await resolveUserId(session.user.id);
    if (ownerUserId === null) return Response.json({ error: "User profile not found" }, { status: 404 });
    const petId = parseInt(params.id, 10);
    const owned = await sql`SELECT 1 FROM pets WHERE id = ${petId} AND owner_user_id = ${ownerUserId} LIMIT 1`;
    if (owned.length === 0) return Response.json({ error: "Pet not found" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").slice(0, 60);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10) || 20, 1), 50);

    const friends = await listPackFriends(sql, { petId, ownerUserId, q, limit });

    // Mark dogs that already share a pack with this pet — ONE query for all of them (the table may
    // not exist pre-migration 0097; then nobody is marked).
    const statusByPartner = new Map();
    try {
      const packs = await sql`
        SELECT requester_pet_id, receiver_pet_id, status FROM pet_pack_streaks
        WHERE requester_pet_id = ${petId} OR receiver_pet_id = ${petId}
      `;
      for (const p of packs) {
        statusByPartner.set(p.requester_pet_id === petId ? p.receiver_pet_id : p.requester_pet_id, p.status);
      }
    } catch (e) {
      if (e?.code !== "42P01") throw e;
    }
    const out = friends.map((f) => ({ ...f, pack_status: statusByPartner.get(f.id) ?? "none" }));
    return Response.json({ friends: out });
  } catch (error) {
    console.error("[GET /api/pets/[id]/pack-friends] ERROR:", error.message);
    return Response.json({ error: "Failed to load friends" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
