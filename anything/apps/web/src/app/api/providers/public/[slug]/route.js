import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

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
export async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const slug = params.slug;

    // Public business fields only — owner_user_profile_id and status are excluded
    // from the projection. A draft (or non-existent) slug never matches.
    const providers = await sql`
      SELECT id, slug, name, provider_type, bio, logo_url FROM providers
      WHERE slug = ${slug} AND status = 'published'
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
      SELECT id, name, description, duration_min, price_cents, deposit_cents, active
      FROM provider_services
      WHERE provider_id = ${provider.id} AND active = true
      ORDER BY created_at ASC
    `;

    return Response.json({ provider, locations, services });
  } catch (error) {
    console.error("[GET /api/providers/public/[slug]] Error:", error.message);
    return Response.json(
      { error: "Failed to fetch provider" },
      { status: 500 },
    );
  }
}
