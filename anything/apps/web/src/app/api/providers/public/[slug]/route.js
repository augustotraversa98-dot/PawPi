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

    // Public business fields only — owner_user_profile_id and status are excluded
    // from the projection. A draft (or non-existent) slug never matches. avg_rating +
    // review_count (ticket 2.2) come from correlated subqueries over provider_reviews —
    // always-correct, no cached column. No reviews → avg_rating NULL + review_count 0.
    const providers = await sql`
      SELECT
        p.id, p.slug, p.name, p.provider_type, p.bio, p.logo_url,
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
      SELECT id, name, description, duration_min, price_cents, deposit_cents, image_urls, active
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

    return Response.json({ provider, locations, services, capabilities });
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
