import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";

const UNDEFINED_COLUMN = "42703"; // pre-0124/0125 DB lacks claim_status/pet_policy → degrade cleanly

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
    //
    // DEGRADE-CLEAN (house pattern; see SCHEMA_NOTES "hand-applied to Supabase after
    // merge"): p.claim_status is an additive column from 0124, hand-applied to Supabase
    // AFTER this code deploys. Try it first, in a SAVEPOINT (this handler runs inside
    // withRequestContext's transaction); on undefined_column (42703) retry without it —
    // ClaimCTA already renders nothing when claim_status isn't 'unclaimed'.
    const selectProviderFull = () => sql`
      SELECT
        p.id, p.slug, p.name, p.provider_type, p.bio, p.logo_url, p.cover_image_url,
        p.website_url, p.instagram_url, p.facebook_url, p.google_maps_url,
        p.storefront_section_order,
        p.claim_status,
        (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM provider_reviews r WHERE r.provider_id = p.id) AS avg_rating,
        (SELECT COUNT(*)::int FROM provider_reviews r WHERE r.provider_id = p.id) AS review_count
      FROM providers p
      WHERE p.slug = ${slug} AND p.status = 'published'
      LIMIT 1
    `;
    const selectProviderPreMigration = () => sql`
      SELECT
        p.id, p.slug, p.name, p.provider_type, p.bio, p.logo_url, p.cover_image_url,
        p.website_url, p.instagram_url, p.facebook_url, p.google_maps_url,
        p.storefront_section_order,
        NULL::text AS claim_status,
        (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM provider_reviews r WHERE r.provider_id = p.id) AS avg_rating,
        (SELECT COUNT(*)::int FROM provider_reviews r WHERE r.provider_id = p.id) AS review_count
      FROM providers p
      WHERE p.slug = ${slug} AND p.status = 'published'
      LIMIT 1
    `;
    let providers;
    try {
      providers = await withSavepoint(selectProviderFull);
    } catch (e) {
      if (e?.code !== UNDEFINED_COLUMN) throw e;
      providers = await selectProviderPreMigration();
    }
    if (providers.length === 0) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    const provider = providers[0];

    // Locations — pulled out of the concurrent batch below because it carries
    // pet_policy (additive, 0124), the same pre-migration DEGRADE-CLEAN concern as
    // claim_status above: run in its own SAVEPOINT so a 42703 here can't abort the
    // sibling queries sharing this request's transaction/connection.
    const selectLocationsFull = () => sql`
      SELECT id, name, address, lat, lng, hours_json, phone, pet_policy
      FROM provider_locations
      WHERE provider_id = ${provider.id}
      ORDER BY created_at ASC
    `;
    const selectLocationsPreMigration = () => sql`
      SELECT id, name, address, lat, lng, hours_json, phone, NULL::text AS pet_policy
      FROM provider_locations
      WHERE provider_id = ${provider.id}
      ORDER BY created_at ASC
    `;
    let locations;
    try {
      locations = await withSavepoint(selectLocationsFull);
    } catch (e) {
      if (e?.code !== UNDEFINED_COLUMN) throw e;
      locations = await selectLocationsPreMigration();
    }

    // The rest surface; only active services do. These reads (plus the two to_regclass
    // probes and the posts-scoped postsCount) are all independent of one another — none depends
    // on another's result — so they're fired together instead of one-by-one, which was adding a
    // full network round trip per query on this hot storefront read path (perf fix, no behavior
    // change; same pattern already used in vet-record/summary and vet-record/full-summary).
    const [
      services,
      capabilityRows,
      products,
      posts,
      commentsProbe,
      postsCountRows,
      pawsProbe,
      walkPackagesProbe,
    ] = await Promise.all([
      sql`
        SELECT id, name, description, duration_min, price_cents, deposit_cents, payment_policy, image_urls, active, is_featured, sort_order
        FROM provider_services
        WHERE provider_id = ${provider.id} AND active = true
        ORDER BY is_featured DESC, sort_order ASC, created_at ASC
      `,
      // Capabilities (ticket 2.1) — the services this published provider offers, public.
      sql`
        SELECT capability FROM provider_capabilities
        WHERE provider_id = ${provider.id}
        ORDER BY capability ASC
      `,
      // Storefront ITEMS (ticket 2.22) — this provider's ACTIVE shop products (public catalog
      // summary). Empty when the provider has no shop / no active products.
      sql`
        SELECT id, name, description, image_urls, price_cents, currency, category, is_rx, is_featured, sort_order, compare_at_cents
        FROM shop_products
        WHERE provider_id = ${provider.id} AND active = true
        ORDER BY is_featured DESC, sort_order ASC, created_at DESC, id DESC
      `,
      // Storefront POSTS (ticket 2.22) — non-deleted, newest first, paginated.
      // Moderation (Guideline 1.2): hidden_at IS NULL drops posts "removed by us".
      // author_user_id is surfaced so the mobile ModerationMenu can Block the author; is_own
      // (author = the caller) lets that menu hide Report on the staff member's own post.
      sql`
        SELECT id, body, image_urls, created_at, author_user_id,
               (author_user_id = current_app_user_id()) AS is_own
        FROM provider_posts
        WHERE provider_id = ${provider.id} AND deleted_at IS NULL AND hidden_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      // comment_count (Phase C) + total Barks (ticket 2.93) need to know whether
      // provider_post_comments (migration 0082, hand-applied to Supabase) exists yet.
      sql`SELECT to_regclass('public.provider_post_comments') IS NOT NULL AS ok`,
      // postsCount (ticket 2.93) — this provider's visible (non-deleted, non-hidden) posts.
      sql`
        SELECT count(*)::int AS n
        FROM provider_posts
        WHERE provider_id = ${provider.id} AND deleted_at IS NULL AND hidden_at IS NULL
      `,
      // pawsCount (ticket 2.93) needs to know whether provider_post_paws (ticket 2.94) exists yet.
      sql`SELECT to_regclass('public.provider_post_paws') IS NOT NULL AS ok`,
      // Walk packages (ticket B2) — this walker's ACTIVE prepaid packs (public offerings). Guarded
      // by a to_regclass probe so an unmigrated prod (no walk_packages table) degrades to [].
      sql`SELECT to_regclass('public.walk_packages') IS NOT NULL AS ok`,
    ]);

    const capabilities = capabilityRows.map((r) => r.capability);
    const hasComments = Array.isArray(commentsProbe) && commentsProbe[0]?.ok === true;
    const postsCount = postsCountRows?.[0]?.n ?? 0;
    const hasPaws = Array.isArray(pawsProbe) && pawsProbe[0]?.ok === true;
    const hasWalkPackages =
      Array.isArray(walkPackagesProbe) && walkPackagesProbe[0]?.ok === true;

    // Active walk packages for the public storefront (empty when none / unmigrated).
    const walkPackages = hasWalkPackages
      ? await sql`
          SELECT id, walks_count, price_cents, currency
          FROM walk_packages
          WHERE provider_id = ${provider.id} AND active = true
          ORDER BY walks_count ASC, created_at ASC
        `
      : [];

    // These three depend on the probes/posts above (hasComments, hasPaws, post ids) but not on
    // each other, so they too run together rather than one-by-one.
    const [counts, barks, paws] = await Promise.all([
      hasComments && posts.length > 0
        ? sql`
            SELECT post_id, count(*)::int AS n
            FROM provider_post_comments
            WHERE post_id = ANY(${posts.map((p) => p.id)}) AND deleted_at IS NULL AND hidden_at IS NULL
            GROUP BY post_id
          `
        : null,
      // Total visible comments across ALL this provider's visible posts (not just the page).
      hasComments
        ? sql`
            SELECT count(*)::int AS n
            FROM provider_post_comments c
            JOIN provider_posts p ON p.id = c.post_id
            WHERE p.provider_id = ${provider.id}
              AND p.deleted_at IS NULL AND p.hidden_at IS NULL
              AND c.deleted_at IS NULL AND c.hidden_at IS NULL
          `
        : null,
      // pawsCount — total likes across those posts. DEGRADEs to 0 until provider_post_paws lands.
      hasPaws
        ? sql`
            SELECT count(*)::int AS n
            FROM provider_post_paws pp
            JOIN provider_posts p ON p.id = pp.post_id
            WHERE p.provider_id = ${provider.id}
              AND p.deleted_at IS NULL AND p.hidden_at IS NULL
          `
        : null,
    ]);

    const commentCounts = counts
      ? Object.fromEntries((counts ?? []).map((r) => [r.post_id, r.n]))
      : {};
    const barksCount = barks?.[0]?.n ?? 0;
    const pawsCount = paws?.[0]?.n ?? 0;
    const postsWithCounts = posts.map((p) => ({
      ...p,
      comment_count: commentCounts[p.id] ?? 0,
    }));

    return Response.json({
      provider,
      locations,
      services,
      capabilities,
      products,
      walk_packages: walkPackages,
      posts: postsWithCounts,
      stats: { postsCount, pawsCount, barksCount },
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
