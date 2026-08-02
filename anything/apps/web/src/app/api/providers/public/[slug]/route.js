import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// A single published provider's PUBLIC profile (docs/provider-design.md §4 item 5).
// Viewable by any logged-in user. Returns public business info + the provider's
// provider_locations + its ACTIVE provider_services (active=true only).
//
// DISTINCT from 4a's GET /api/providers/[id]: that one is membership-gated and
// returns the staff list. This is public, published-only, and never returns staff,
// owner identity (owner_user_profile_id), or any pet data. A draft (unpublished)
// slug → 404. Like /discover, it MUST NOT read care_access_grants.
//
// Auth: session required (401); no per-user scoping, so no resolveUserId /
// requireProviderRole.
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const slug = params.slug;

    // Storefront paging for the posts feed (ticket 2.22) — same shape as /api/posts.
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("postsLimit") || "20", 10) || 20, 1),
      50,
    );
    const offset = Math.max(
      parseInt(searchParams.get("postsOffset") || "0", 10) || 0,
      0,
    );

    // Public business fields only — owner_user_profile_id and status are excluded
    // from the projection. A draft (or non-existent) slug never matches. avg_rating +
    // review_count (ticket 2.2) come from correlated subqueries over provider_reviews —
    // always-correct, no cached column. No reviews → avg_rating NULL + review_count 0.
    // cover_image_url (ticket 2.22) is the storefront banner.
    const providers = await sql`
      SELECT
        p.id, p.slug, p.name, p.provider_type, p.bio, p.logo_url, p.cover_image_url,
        p.website_url, p.instagram_url, p.facebook_url, p.google_maps_url,
        (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM provider_reviews r WHERE r.provider_id = p.id) AS avg_rating,
        (SELECT COUNT(*)::int FROM provider_reviews r WHERE r.provider_id = p.id) AS review_count
      FROM providers p
      WHERE p.slug = ${slug} AND p.status = 'published'
      LIMIT 1
    `;
    if (providers.length === 0) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    const provider = providers[0];

    // All locations surface; only active services do.
    const locations = await sql`
      SELECT id, name, address, lat, lng, hours_json, phone
      FROM provider_locations
      WHERE provider_id = ${provider.id}
      ORDER BY created_at ASC
    `;

    const services = await sql`
      SELECT id, name, description, duration_min, price_cents, deposit_cents, payment_policy, image_urls, active
      FROM provider_services
      WHERE provider_id = ${provider.id} AND active = true
      ORDER BY created_at ASC
    `;

    // Capabilities (ticket 2.1) — the services this published provider offers, public.
    const capabilityRows = await sql`
      SELECT capability FROM provider_capabilities
      WHERE provider_id = ${provider.id}
      ORDER BY capability ASC
    `;
    const capabilities = capabilityRows.map((r) => r.capability);

    // Storefront ITEMS (ticket 2.22) — this provider's ACTIVE shop products (public catalog
    // summary). Empty when the provider has no shop / no active products.
    const products = await sql`
      SELECT id, name, description, image_urls, price_cents, currency, category, is_rx
      FROM shop_products
      WHERE provider_id = ${provider.id} AND active = true
      ORDER BY created_at DESC, id DESC
    `;

    // Storefront POSTS (ticket 2.22) — non-deleted, newest first, paginated.
    // Moderation (Guideline 1.2): hidden_at IS NULL drops posts "removed by us".
    // author_user_id is surfaced so the mobile ModerationMenu can Block the author; is_own
    // (author = the caller) lets that menu hide Report on the staff member's own post.
    const posts = await sql`
      SELECT id, body, image_urls, created_at, author_user_id,
             (author_user_id = current_app_user_id()) AS is_own
      FROM provider_posts
      WHERE provider_id = ${provider.id} AND deleted_at IS NULL AND hidden_at IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return Response.json({
      provider,
      locations,
      services,
      capabilities,
      products,
      posts,
    });
  } catch (error) {
    console.error("[GET /api/providers/public/[slug]] Error:", error.message);
    return Response.json(
      { error: "Failed to fetch provider" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
