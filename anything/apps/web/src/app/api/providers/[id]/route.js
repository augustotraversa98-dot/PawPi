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
const PROFILE_FIELDS = ["name", "provider_type", "bio", "logo_url", "slug"];

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

    const providers = await sql`
      SELECT * FROM providers WHERE id = ${providerId} LIMIT 1
    `;
    if (providers.length === 0) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    const staff = await sql`
      SELECT * FROM provider_staff WHERE provider_id = ${providerId}
      ORDER BY created_at ASC
    `;

    return Response.json({ provider: providers[0], staff });
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
