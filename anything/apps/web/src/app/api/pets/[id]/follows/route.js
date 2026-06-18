import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

/**
 * GET /api/pets/[id]/follows?rel=followers|following&viewerPetId=NN
 *
 * Lists, for a pet (ticket 2.61):
 *   - rel=followers → the pets that follow this pet,
 *   - rel=following → the pets this pet follows,
 * each as a PUBLIC pet card (id, name, handle, avatar_url, owner display name)
 * plus `is_following`: whether the caller's active pet (viewerPetId) already
 * follows that pet — so the toggle renders correct in one round-trip.
 *
 * Public fields only — never owner-private/medical data. Reuses the existing
 * pet_follows read posture (the social profile route reads it the same way); no
 * RLS change.
 */
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const petId = parseInt(params?.id ?? "", 10);
    if (!Number.isInteger(petId)) {
      return Response.json({ error: "Invalid pet id" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const rel = searchParams.get("rel") || "followers";
    if (rel !== "followers" && rel !== "following") {
      return Response.json(
        { error: "rel must be 'followers' or 'following'" },
        { status: 400 },
      );
    }

    const viewerRaw = searchParams.get("viewerPetId");
    const viewerPetId = /^\d+$/.test(viewerRaw || "")
      ? parseInt(viewerRaw, 10)
      : null;
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "100", 10) || 100, 1),
      200,
    );
    const offset = Math.max(
      parseInt(searchParams.get("offset") || "0", 10) || 0,
      0,
    );

    // followers: pets whose follow row points AT this pet (follower side).
    // following: pets this pet points at (followed side).
    // Either way, LEFT JOIN the viewer's follow rows to flag is_following, and
    // JOIN user_profiles only for the PUBLIC owner display name.
    const rows =
      rel === "followers"
        ? await sql`
            SELECT p.id, p.name, p.handle, p.avatar_url,
                   up.full_name, up.username,
                   (vf.id IS NOT NULL) AS is_following
            FROM pet_follows f
            JOIN pets p ON p.id = f.follower_pet_id
            LEFT JOIN user_profiles up ON up.id = p.owner_user_id
            LEFT JOIN pet_follows vf
              ON vf.follower_pet_id = ${viewerPetId}
             AND vf.followed_pet_id = p.id
            WHERE f.followed_pet_id = ${petId}
            ORDER BY f.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
          `
        : await sql`
            SELECT p.id, p.name, p.handle, p.avatar_url,
                   up.full_name, up.username,
                   (vf.id IS NOT NULL) AS is_following
            FROM pet_follows f
            JOIN pets p ON p.id = f.followed_pet_id
            LEFT JOIN user_profiles up ON up.id = p.owner_user_id
            LEFT JOIN pet_follows vf
              ON vf.follower_pet_id = ${viewerPetId}
             AND vf.followed_pet_id = p.id
            WHERE f.follower_pet_id = ${petId}
            ORDER BY f.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
          `;

    // Whitelist the output — no owner-private or medical fields ever leak.
    const pets = rows.map((r) => ({
      id: r.id,
      name: r.name,
      handle: r.handle,
      avatar_url: r.avatar_url,
      owner_name: r.full_name || r.username || "",
      is_following: !!r.is_following,
    }));

    return Response.json({ pets });
  } catch (error) {
    console.error("[GET /api/pets/[id]/follows] ERROR:", error.message);
    return Response.json({ error: "Failed to load follows" }, { status: 500 });
  }
}

// RLS R1-rollout: identity-scoped wrapper (docs/rls-hardening.md).
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
