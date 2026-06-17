import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/feed/suggestions — Phase 2 ticket 2.13 (docs/phase2-tickets/2.13-feed-integration.md).
//
// A SIBLING endpoint to /api/posts (the social feed). It returns a small, ordered list of
// PUBLIC "suggestion" cards — published providers (discovery) and adoptable dogs (2.12) — that
// the mobile feed interleaves between pet posts at a controlled cadence (see CADENCE_EVERY_N /
// MAX_SUGGESTIONS in the mobile useFeedSuggestions hook + interleaveSuggestions helper).
//
// WHY A SIBLING ENDPOINT (not extending /api/posts):
//   - /api/posts (Following + Suggested mergeFeed) and the BeReal daily-lock are left 100%
//     untouched — existing post shapes, ordering, pagination, and tests are unchanged.
//   - Suggestion cards are a SEPARATE card type with a `kind` discriminator ('provider' |
//     'adoption'); they are NEVER faked as pet posts.
//   - Interleaving happens client-side from two independent reads, so neither query can
//     disturb the other.
//
// NO-LEAK CONTRACT (enforced by the SELECT projections + tests):
//   - Provider items expose only public business fields (the same set as /providers/discover):
//     id, slug, name, provider_type, bio, logo_url, avg_rating, review_count. NEVER
//     owner_user_profile_id, provider_staff, or any pet/medical data.
//   - Adoption items expose only the public dog-profile fields of an AVAILABLE listing of a
//     PUBLISHED place (the same public subset the adoptable-listings route returns). NEVER the
//     applicant, the shelter's owner identity, or any owner/medical data.
//   - This endpoint never reads care_access_grants, posts, pets, user_profiles, or any owned
//     table.
//
// Auth: a session is required (401 otherwise); no per-user scoping — published providers and
// available listings of published places are public to every logged-in user (RLS 0038 already
// scopes adoptable_listings to available-of-published for non-staff). So there is deliberately
// no resolveUserId / user_profiles lookup here.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager") — never sql(string, []).

// Cap how many of each suggestion source we ever fetch, so the endpoint can never flood the
// feed even if the cadence on the client were misconfigured. The client caps again.
const PROVIDER_FETCH_CAP = 10;
const ADOPTION_FETCH_CAP = 10;

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Optional ?type=<capability> filter mirrors discovery (2.1): when present, provider
    // suggestions match providers HAVING that capability (JOIN provider_capabilities), never
    // provider_type. Absent => all published providers.
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const providerLimit = clampLimit(
      searchParams.get("providerLimit"),
      PROVIDER_FETCH_CAP,
    );
    const adoptionLimit = clampLimit(
      searchParams.get("adoptionLimit"),
      ADOPTION_FETCH_CAP,
    );

    // 1) Provider suggestions — published only, public business fields + aggregate rating (2.2).
    //    Highest-rated first so the most relevant businesses surface; capped.
    const providerRows = type
      ? await sql`
          SELECT DISTINCT
            p.id, p.slug, p.name, p.provider_type, p.bio, p.logo_url,
            (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM provider_reviews r WHERE r.provider_id = p.id) AS avg_rating,
            (SELECT COUNT(*)::int FROM provider_reviews r WHERE r.provider_id = p.id) AS review_count
          FROM providers p
          JOIN provider_capabilities pc ON pc.provider_id = p.id
          WHERE p.status = 'published' AND pc.capability = ${type}
          ORDER BY avg_rating DESC NULLS LAST, p.name ASC
          LIMIT ${providerLimit}
        `
      : await sql`
          SELECT
            p.id, p.slug, p.name, p.provider_type, p.bio, p.logo_url,
            (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM provider_reviews r WHERE r.provider_id = p.id) AS avg_rating,
            (SELECT COUNT(*)::int FROM provider_reviews r WHERE r.provider_id = p.id) AS review_count
          FROM providers p
          WHERE p.status = 'published'
          ORDER BY avg_rating DESC NULLS LAST, p.name ASC
          LIMIT ${providerLimit}
        `;

    // 2) Adoption suggestions — AVAILABLE listings of PUBLISHED places, public dog-profile
    //    fields only. The status='available' + published-place filter mirrors the RLS read
    //    policy (0038) so this is exactly the discovery-visible set. Newest first; capped.
    const adoptionRows = await sql`
      SELECT
        l.id, l.provider_id, l.name, l.breed, l.age_years, l.age_months, l.gender,
        l.size, l.photo_urls, l.energy_level, l.adoption_fee_cents, l.currency,
        pr.slug AS provider_slug, pr.name AS provider_name
      FROM adoptable_listings l
      JOIN providers pr ON pr.id = l.provider_id
      WHERE l.status = 'available' AND pr.status = 'published'
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ${adoptionLimit}
    `;

    // Tag each row with its discriminator. The client never has to guess a card's type.
    const providers = providerRows.map((p) => ({ kind: "provider", ...p }));
    const adoptions = adoptionRows.map((l) => ({ kind: "adoption", ...l }));

    return Response.json({ suggestions: { providers, adoptions } });
  } catch (error) {
    console.error("[GET /api/feed/suggestions] Error:", error.message);
    return Response.json(
      { error: "Failed to fetch feed suggestions" },
      { status: 500 },
    );
  }
}

// Parse a non-negative integer query param, clamped to [0, cap]; fall back to cap.
function clampLimit(raw, cap) {
  const n = parseInt(raw ?? "", 10);
  if (!Number.isInteger(n) || n < 0) return cap;
  return Math.min(n, cap);
}

// RLS R1-rollout: identity-scoped wrapper (docs/rls-hardening.md). Handler body is unchanged —
// only its DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
