import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/search?q=… — real Search across pets, owners, and provider businesses
// (ticket 2.25). Replaces the mobile mock discovery data.
//
// PUBLIC FIELDS ONLY, RLS-scoped:
//   • pets      — name/breed/handle/species match → public profile fields (pets are
//                 any-authed read). NEVER owner_user_id or any medical column.
//   • owners    — username/full_name match → username/full_name/avatar only (user_profiles
//                 carries no contact/auth data — that lives in auth_users).
//   • providers — PUBLISHED only (status='published'), name match → public business fields,
//                 mirroring /providers/discover. Drafts never surface.
//
// Simple ILIKE matching with sane limits (no search engine). A short/empty query
// returns empty arrays (no "show everything" fallback). Session required.
const LIMIT = 12;
const MIN_Q = 2;

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    if (q.length < MIN_Q) {
      return Response.json({ pets: [], owners: [], providers: [] });
    }
    const pattern = `%${q}%`;

    // Pets — public profile fields only (no owner_user_id, no medical columns).
    // Moderation (T3): drop pets whose owner is blocked (either direction) or banned.
    const pets = await sql`
      SELECT id, name, handle, avatar_url, species, breed
      FROM pets
      WHERE (name ILIKE ${pattern}
         OR breed ILIKE ${pattern}
         OR handle ILIKE ${pattern}
         OR species ILIKE ${pattern})
        AND NOT app_user_is_blocked(current_app_user_id(), owner_user_id)
        AND owner_user_id NOT IN (SELECT id FROM user_profiles WHERE banned_at IS NOT NULL)
      ORDER BY name ASC
      LIMIT ${LIMIT}
    `;

    // Owners — public identity fields only.
    // Moderation (T3): drop blocked (either direction) or banned users.
    const owners = await sql`
      SELECT id, username, full_name, avatar_url
      FROM user_profiles
      WHERE (username ILIKE ${pattern}
         OR full_name ILIKE ${pattern})
        AND banned_at IS NULL
        AND NOT app_user_is_blocked(current_app_user_id(), id)
      ORDER BY username ASC
      LIMIT ${LIMIT}
    `;

    // Providers — PUBLISHED businesses only, public fields (mirrors /discover).
    const providers = await sql`
      SELECT id, slug, name, provider_type, logo_url
      FROM providers
      WHERE status = 'published'
        AND name ILIKE ${pattern}
      ORDER BY name ASC
      LIMIT ${LIMIT}
    `;

    return Response.json({ pets, owners, providers });
  } catch (error) {
    console.error("[GET /api/search] Error:", error.message);
    return Response.json({ error: "Search failed" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
