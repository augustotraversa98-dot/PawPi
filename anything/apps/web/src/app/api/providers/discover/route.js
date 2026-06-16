import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Owner-facing provider discovery (docs/provider-design.md §4 item 5).
// The PUBLIC read view: any logged-in owner can browse PUBLISHED providers.
// This is DISTINCT from the staff-only management GETs (4a, GET /api/providers
// and /api/providers/[id]) which require provider_staff membership and return the
// staff list. Discovery is the one provider surface with NO consent involved:
// it returns public business info only and MUST NOT read care_access_grants or
// any pet/owner data.
//
// Auth: a session is required (401 otherwise), but no per-user scoping — published
// providers are visible to every logged-in user — so there is deliberately no
// resolveUserId / user_profiles lookup and no requireProviderRole here.
//
// Returns ONLY status='published' providers; draft providers are invisible.
// Public business fields only — never owner identity (owner_user_profile_id),
// staff, or pet data.
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Optional ?type=<capability> filter (e.g. ?type=vet). Ticket 2.1: discovery now
    // matches providers that HAVE the capability (JOIN provider_capabilities), NOT
    // provider_type — so a "vet shop" appears under both ?type=vet and ?type=shop. A
    // provider with multiple capabilities is returned once per matching query.
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    // Two tagged-template variants (never sql(string, array)) — published-only in both;
    // the filtered form JOINs provider_capabilities and binds ${type} (DISTINCT so a
    // provider holding the capability appears once). See SCHEMA_NOTES "neon→porsager".
    const providers = type
      ? await sql`
          SELECT DISTINCT p.id, p.slug, p.name, p.provider_type, p.bio, p.logo_url
          FROM providers p
          JOIN provider_capabilities pc ON pc.provider_id = p.id
          WHERE p.status = 'published' AND pc.capability = ${type}
          ORDER BY p.name ASC
        `
      : await sql`
          SELECT id, slug, name, provider_type, bio, logo_url FROM providers
          WHERE status = 'published'
          ORDER BY name ASC
        `;

    return Response.json({ providers });
  } catch (error) {
    console.error("[GET /api/providers/discover] Error:", error.message);
    return Response.json(
      { error: "Failed to fetch providers" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
