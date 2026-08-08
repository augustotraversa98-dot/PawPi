import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import {
  requireProviderRole,
  ALL_PROVIDER_ROLES,
} from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// One provider: read (any active staff) and profile update (owner|admin).
// Every path resolves identity -> user_profiles.id then authorizes via
// requireProviderRole scoped to the path :id, so a non-staff caller gets 403 and
// acting on provider A can never touch provider B. Publish/unpublish lives in the
// dedicated ./publish route — this PATCH updates profile fields ONLY and never
// changes owner_user_profile_id or status.

// Fields a profile PATCH may set. owner_user_profile_id and status are
// deliberately absent — ownership is immutable here and status flips only through
// the publish route.
const PROFILE_FIELDS = [
  "name",
  "provider_type",
  "bio",
  "logo_url",
  "slug",
  // Public business links (ticket 2.20) — optional; the profile editor writes them here.
  "website_url",
  "instagram_url",
  "facebook_url",
  "google_maps_url",
  // Storefront banner (ticket 2.22) — optional; set from the Storefront section.
  "cover_image_url",
  // Auto-confirm new bookings (0079) — a boolean operational setting, owner|admin only like
  // every field here. Boolean-validated below before it reaches the SET list.
  "auto_confirm_bookings",
  // IANA time zone (0076) — the zone the availability window wall-clock times are local to, so
  // the slot engine composes "09:00" correctly. IANA-validated below before it reaches the SET
  // list; a bad zone would break slot math for every booking.
  "time_zone",
];

// Is `tz` a real IANA time zone? Intl throws a RangeError for anything the platform's
// time-zone database doesn't know, so a successful construction is the validation.
function isValidTimeZone(tz) {
  if (typeof tz !== "string" || tz.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Get one provider — requires active staff membership (any role) or 403.
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // Any active staff member may read.
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    // avg_rating + review_count (ticket 2.2) are computed here too — same correlated
    // subqueries as the public route — so the extranet "view-as-customer" preview (2b) can
    // render the store header rating for the owner's OWN provider, including a DRAFT one
    // (this route is membership-gated, not published-gated). Additive: extra keys only.
    const providers = await sql`
      SELECT
        p.*,
        (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM provider_reviews r WHERE r.provider_id = p.id) AS avg_rating,
        (SELECT COUNT(*)::int FROM provider_reviews r WHERE r.provider_id = p.id) AS review_count
      FROM providers p WHERE p.id = ${providerId} LIMIT 1
    `;
    if (providers.length === 0) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    const staff = await sql`
      SELECT * FROM provider_staff WHERE provider_id = ${providerId}
      ORDER BY created_at ASC
    `;

    // Capabilities (ticket 2.1) — the services this provider offers. Returned as a flat
    // string[] so callers gate modules on capability, not provider_type.
    const capabilityRows = await sql`
      SELECT capability FROM provider_capabilities WHERE provider_id = ${providerId}
      ORDER BY capability ASC
    `;
    const capabilities = capabilityRows.map((r) => r.capability);

    return Response.json({ provider: providers[0], staff, capabilities });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[GET /api/providers/[id]] Error:", error.message);
    return Response.json({ error: "Failed to fetch provider" }, { status: 500 });
  }
}

// Update provider profile fields — owner|admin only. Never changes
// owner_user_profile_id or status (status flips via ./publish).
async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // Mutation: owner|admin only (requireProviderRole default).
    await requireProviderRole(providerId, userId);

    const body = (await request.json()) ?? {};

    // auto_confirm_bookings (0079) is a boolean column — reject any non-boolean so a stray
    // value can't be bound into it (the other whitelist fields are free-text).
    if (
      body.auto_confirm_bookings !== undefined &&
      typeof body.auto_confirm_bookings !== "boolean"
    ) {
      return Response.json(
        { error: "auto_confirm_bookings must be a boolean" },
        { status: 400 },
      );
    }

    // time_zone (0076) must be a real IANA zone — never persist garbage, which would break
    // slot composition for every booking.
    if (
      body.time_zone !== undefined &&
      !isValidTimeZone(body.time_zone)
    ) {
      return Response.json(
        { error: "time_zone must be a valid IANA time zone" },
        { status: 400 },
      );
    }

    // Re-validate slug uniqueness if it changed — exclude this provider so a
    // no-op slug write doesn't collide with itself.
    if (body.slug !== undefined) {
      const clash = await sql`
        SELECT id FROM providers
        WHERE slug = ${body.slug} AND id <> ${providerId}
        LIMIT 1
      `;
      if (clash.length > 0) {
        return Response.json({ error: "slug already in use" }, { status: 409 });
      }
    }

    // Build the SET list from the whitelist only — owner_user_profile_id and
    // status can never be smuggled in, regardless of the request body.
    const updates = [];
    const values = [];
    let paramIndex = 1;
    for (const field of PROFILE_FIELDS) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${paramIndex++}`);
        values.push(body[field]);
      }
    }

    if (updates.length === 0) {
      return Response.json(
        { error: "No updatable fields provided" },
        { status: 400 },
      );
    }

    updates.push(`updated_at = NOW()`);
    values.push(providerId);

    // sql.unsafe (params still bound) — the column LIST is dynamic, the values
    // are not interpolated. See SCHEMA_NOTES "neon→porsager" gotcha.
    const updateQuery = `
      UPDATE providers
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    const result = await sql.unsafe(updateQuery, values);

    return Response.json({ provider: result[0] });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[PATCH /api/providers/[id]] Error:", error.message);
    return Response.json({ error: "Failed to update provider" }, { status: 500 });
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPATCH = withRequestContext(PATCH);
export { wrappedGET as GET, wrappedPATCH as PATCH };
