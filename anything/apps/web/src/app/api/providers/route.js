import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";

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
export async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, provider_type, bio, logo_url, slug } = body ?? {};

    if (!name || !provider_type) {
      return Response.json(
        { error: "name and provider_type are required" },
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

    // Atomic: the providers row AND its owner provider_staff row are inserted in
    // a single CTE statement, so a provider can never exist without its owner
    // membership (and vice versa) — all-or-nothing.
    const created = await sql`
      WITH new_provider AS (
        INSERT INTO providers
          (owner_user_profile_id, provider_type, name, slug, bio, logo_url, status)
        VALUES
          (${userId}, ${provider_type}, ${name}, ${finalSlug}, ${bio ?? null}, ${logo_url ?? null}, 'draft')
        RETURNING *
      ), new_staff AS (
        INSERT INTO provider_staff (provider_id, user_profile_id, role, status)
        SELECT id, ${userId}, 'owner', 'active' FROM new_provider
        RETURNING id
      )
      SELECT * FROM new_provider
    `;

    return Response.json({ provider: created[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/providers] Error:", error.message);
    return Response.json({ error: "Failed to create provider" }, { status: 500 });
  }
}

// List the providers the current user is ACTIVE staff of — never others'.
export async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ providers: [] });
    }

    const providers = await sql`
      SELECT p.*
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
