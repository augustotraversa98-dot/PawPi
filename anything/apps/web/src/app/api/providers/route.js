import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId, ensureUserProfile } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { ALLOWED_CAPABILITIES } from "@/app/api/utils/providerAuth";

// RLS R1 pilot route: handlers are wrapped at the bottom with withRequestContext
// (DB work runs in a transaction carrying the caller's identity). Bodies unchanged.

// Provider onboarding backend (docs/provider-design.md §4 item 4 / ticket 4a).
// An existing logged-in user creates a provider (becoming its owner) and lists
// the providers they are active staff of. Identity is resolved auth_users.id ->
// user_profiles.id; provider authorization is by provider_staff membership, never
// by user_profiles.role.

// Build a URL-safe slug from arbitrary text. Lowercase, non-alphanumerics -> '-',
// trimmed; falls back to 'provider' when nothing usable remains.
function slugify(text) {
  return (
    String(text || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "provider"
  );
}

// Create a provider — the caller becomes its active 'owner'.
async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Lazily create the user_profiles row if this is a fresh user who never made a
    // pet (the #108 gap that 404'd business owners here). Stamps the request identity
    // before the provider/staff CTE so it passes FORCE-RLS WITH CHECK. See
    // ensureUserProfile.
    const userId = await ensureUserProfile(session.user.id, {
      fullName: session.user.name,
      email: session.user.email,
    });

    const body = await request.json();
    const {
      name,
      provider_type,
      bio,
      logo_url,
      slug,
      capabilities,
      website_url,
      instagram_url,
      facebook_url,
      google_maps_url,
    } = body ?? {};

    // Links (ticket 2.20) are OPTIONAL public profile fields. Trim; an empty/blank/non-string
    // value becomes null (never hard-fail a messy value — enrichment 2.21 cleans them later).
    const link = (v) => {
      const t = typeof v === "string" ? v.trim() : "";
      return t || null;
    };
    const websiteUrl = link(website_url);
    const instagramUrl = link(instagram_url);
    const facebookUrl = link(facebook_url);
    const googleMapsUrl = link(google_maps_url);

    if (!name || !provider_type) {
      return Response.json(
        { error: "name and provider_type are required" },
        { status: 400 },
      );
    }

    // capabilities[] (multi-select, ticket 2.1) — optional on create. Normalize to a
    // deduped list and validate every entry against the allowed set (a bad value is a
    // 400, not a DB CHECK 500). Default: if none provided, seed the one capability that
    // matches provider_type when it is itself a valid capability — so a provider always
    // surfaces under at least its primary category in discovery (mirrors the backfill).
    if (capabilities !== undefined && !Array.isArray(capabilities)) {
      return Response.json(
        { error: "capabilities must be an array" },
        { status: 400 },
      );
    }
    let caps = Array.from(new Set(capabilities ?? []));
    if (caps.length === 0 && ALLOWED_CAPABILITIES.includes(provider_type)) {
      caps = [provider_type];
    }
    const invalid = caps.filter((c) => !ALLOWED_CAPABILITIES.includes(c));
    if (invalid.length > 0) {
      return Response.json(
        { error: `Invalid capability: ${invalid.join(", ")}` },
        { status: 400 },
      );
    }

    // Resolve a unique slug: start from the requested slug (or the name) and
    // append the first free -N suffix on collision. Deterministic (no randomness).
    const base = slugify(slug || name);
    const existing = await sql`
      SELECT slug FROM providers
      WHERE slug = ${base} OR slug LIKE ${base + "-%"}
    `;
    const taken = new Set(existing.map((r) => r.slug));
    let finalSlug = base;
    let n = 2;
    while (taken.has(finalSlug)) {
      finalSlug = `${base}-${n}`;
      n += 1;
    }

    // The providers row and its owner provider_staff row are inserted in a single
    // atomic CTE, so a provider can never exist without its owner membership.
    const created = await sql`
      WITH new_provider AS (
        INSERT INTO providers
          (owner_user_profile_id, provider_type, name, slug, bio, logo_url, status,
           website_url, instagram_url, facebook_url, google_maps_url)
        VALUES
          (${userId}, ${provider_type}, ${name}, ${finalSlug}, ${bio ?? null}, ${logo_url ?? null}, 'draft',
           ${websiteUrl}, ${instagramUrl}, ${facebookUrl}, ${googleMapsUrl})
        RETURNING *
      ), new_staff AS (
        INSERT INTO provider_staff (provider_id, user_profile_id, role, status)
        SELECT id, ${userId}, 'owner', 'active' FROM new_provider
        RETURNING id
      )
      SELECT * FROM new_provider
    `;

    const provider = created[0];

    // Capabilities are inserted in a SEPARATE statement AFTER the owner-staff row —
    // NOT inside the CTE above — within the SAME request transaction (withRequestContext).
    // Why split: provider_capabilities' write policy (0027) requires
    // app_is_provider_admin(provider_id), which (0024) is true only when an ACTIVE
    // owner/admin provider_staff row already EXISTS for current_app_user_id(). Inside the
    // CTE, a new_caps branch could not see new_staff's just-inserted row (one CTE = one
    // snapshot), so the insert was DENIED by RLS. As a later statement under READ COMMITTED
    // it sees the in-transaction owner row, so app_is_provider_admin() is true and the
    // insert passes. unnest(empty array) → no rows; ON CONFLICT keeps it idempotent against
    // UNIQUE(provider_id, capability).
    //
    // Still atomic: this runs in the same request transaction as the CTE, so a failure here
    // aborts that transaction — the provider + owner-staff rows roll back (no half-created
    // provider). We let the DB error propagate to the catch below, which maps it to the 500.
    await sql`
      INSERT INTO provider_capabilities (provider_id, capability)
      SELECT ${provider.id}, cap
      FROM unnest(${caps}::text[]) AS cap
      ON CONFLICT (provider_id, capability) DO NOTHING
    `;

    return Response.json(
      { provider: { ...provider, capabilities: [...caps].sort() } },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/providers] Error:", error.message);
    return Response.json({ error: "Failed to create provider" }, { status: 500 });
  }
}

// List the providers the current user is ACTIVE staff of — never others'.
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ providers: [] });
    }

    // Each row carries its capabilities as a text[] (ticket 2.1 → Phase 2 nav
    // filtering): a correlated aggregate over provider_capabilities, COALESCEd to
    // an empty array so a capability-less provider still returns [] (never null).
    // The subquery reads under the caller's identity — provider_capabilities' SELECT
    // policy (0027) allows any active staff of the provider, which this caller is.
    const providers = await sql`
      SELECT p.*,
        COALESCE(
          (
            SELECT array_agg(pc.capability ORDER BY pc.capability)
            FROM provider_capabilities pc
            WHERE pc.provider_id = p.id
          ),
          ARRAY[]::text[]
        ) AS capabilities
      FROM providers p
      JOIN provider_staff ps ON ps.provider_id = p.id
      WHERE ps.user_profile_id = ${userId}
        AND ps.status = 'active'
      ORDER BY p.created_at DESC
    `;

    return Response.json({ providers });
  } catch (error) {
    console.error("[GET /api/providers] Error:", error.message);
    return Response.json({ error: "Failed to list providers" }, { status: 500 });
  }
}

// RLS R1: export the identity-scoped wrappers under the public method names.
const wrappedPOST = withRequestContext(POST);
const wrappedGET = withRequestContext(GET);
export { wrappedPOST as POST, wrappedGET as GET };
