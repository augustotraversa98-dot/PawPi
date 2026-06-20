import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Public-within-the-app pet profile: any authed user may read any pet's
// profile (it's social — no owner restriction). The [id] segment is a real
// pet_id OR a pet handle. Optional ?viewerPetId=NN drives the isFollowing flag
// for the viewer's own pet; ?limit / ?offset paginate the daily-moments grid.
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const viewerPetId = searchParams.get("viewerPetId");

    // Daily-moments page window. Mirrors /api/posts limit/offset; clamped so a
    // bad/absent value falls back to a grid-sized page rather than NaN.
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "24", 10) || 24, 1),
      60,
    );
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);

    // Resolve the target pet by id OR handle. A purely-numeric segment is a
    // pet_id; anything else is a handle (a leading '@' is tolerated — clients
    // pass @rex). Every stat/moment below scopes by the RESOLVED numeric id, so
    // a handle never reaches the aggregate queries and cross-pet isolation holds.
    const idParam = String(params.id ?? "");
    const isNumericId = /^\d+$/.test(idParam);
    const handle = idParam.replace(/^@/, "");

    // Pet identity. notes is deliberately NOT selected (private). No bio/location
    // columns exist in the schema, so they are omitted.
    const petRows = isNumericId
      ? await sql`
          SELECT id, name, handle, avatar_url, species, breed,
                 age_years, age_months, gender, owner_user_id
          FROM pets
          WHERE id = ${idParam}
          LIMIT 1
        `
      : await sql`
          SELECT id, name, handle, avatar_url, species, breed,
                 age_years, age_months, gender, owner_user_id
          FROM pets
          WHERE handle = ${handle}
          LIMIT 1
        `;

    if (petRows.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }

    const { owner_user_id, ...pet } = petRows[0];
    const petId = pet.id;

    // Moderation (T3): a banned owner's, or a blocked user's (either direction), pet
    // profile is invisible — 404 like a missing pet (don't leak that it exists).
    const guardRows = await sql`
      SELECT (banned_at IS NOT NULL) AS banned,
             app_user_is_blocked(current_app_user_id(), ${owner_user_id}) AS blocked
      FROM user_profiles WHERE id = ${owner_user_id} LIMIT 1
    `;
    if (guardRows.length === 0 || guardRows[0].banned || guardRows[0].blocked) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }

    // Owner (via pets.owner_user_id = user_profiles.id).
    const ownerRows = await sql`
      SELECT id, full_name, username, avatar_url
      FROM user_profiles
      WHERE id = ${owner_user_id}
      LIMIT 1
    `;
    const owner = ownerRows[0] || null;

    // Aggregate stats. Zero when there's nothing — no fabricated counts.
    const statRows = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM posts WHERE pet_id = ${petId}) AS total_posts,
        (SELECT COUNT(*)::int FROM post_paws pp
           JOIN posts po ON po.id = pp.post_id
          WHERE po.pet_id = ${petId}) AS total_paws,
        (SELECT COUNT(*)::int FROM post_barks pb
           JOIN posts po ON po.id = pb.post_id
          WHERE po.pet_id = ${petId}) AS total_barks,
        (SELECT COUNT(*)::int FROM pet_follows WHERE followed_pet_id = ${petId}) AS followers,
        (SELECT COUNT(*)::int FROM pet_follows WHERE follower_pet_id = ${petId}) AS following
    `;
    const s = statRows[0];
    const stats = {
      totalPosts: s.total_posts,
      totalPaws: s.total_paws,
      totalBarks: s.total_barks,
      followers: s.followers,
      following: s.following,
    };

    // Does the viewer's pet follow this pet?
    let isFollowing = false;
    if (viewerPetId) {
      const followRows = await sql`
        SELECT 1 FROM pet_follows
        WHERE follower_pet_id = ${viewerPetId}
          AND followed_pet_id = ${petId}
        LIMIT 1
      `;
      isFollowing = followRows.length > 0;
    }

    // Daily-moments grid: this pet's posts, newest first. Empty array when none.
    const posts = await sql`
      SELECT
        p.id,
        p.image_url,
        p.caption,
        p.post_date,
        p.is_daily_update,
        COALESCE(paw.count, 0)::int as paw_count,
        COALESCE(bark.count, 0)::int as bark_count
      FROM posts p
      LEFT JOIN (
        SELECT post_id, COUNT(*) as count FROM post_paws GROUP BY post_id
      ) paw ON p.id = paw.post_id
      LEFT JOIN (
        SELECT post_id, COUNT(*) as count FROM post_barks GROUP BY post_id
      ) bark ON p.id = bark.post_id
      WHERE p.pet_id = ${petId}
        AND p.hidden_at IS NULL
      ORDER BY p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return Response.json({ pet, owner, stats, isFollowing, posts });
  } catch (error) {
    console.error("Error fetching pet profile:", error);
    return Response.json(
      { error: "Failed to fetch pet profile" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
