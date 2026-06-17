import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderRole,
  requireProviderCapability,
  ProviderAuthError,
  ALL_PROVIDER_ROLES,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/providers/[id]/daycare-requirements — the facility CONFIGURES the vaccines it
// REQUIRES for a daycare/boarding stay (per provider, optionally per location). Phase 2
// ticket 2.8 (docs/phase2-tickets/2.8-daycare-boarding.md).
//
// This is provider CONFIGURATION (no pet data), so it gates on provider_staff membership
// (requireProviderRole), NOT assertCareAccess. The MODULE gate requireProviderCapability
// (providerId,'daycare') runs first. RLS on daycare_requirements (0034) is the last line
// (owner|admin write; active staff / published-provider read).
//
//   GET  — list this provider's requirements (any active staff; the public read of a
//          PUBLISHED provider's requirements is via the owner book path, not this route).
//   POST — owner|admin adds a required vaccine. Idempotent-ish: a duplicate (provider,
//          location, name) returns the existing/refreshed row rather than erroring.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is a
// tagged template; params bind via `${}`.
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

    await requireProviderCapability(providerId, "daycare");
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    const requirements = await sql`
      SELECT id, provider_id, location_id, vaccine_name, active, created_at
      FROM daycare_requirements
      WHERE provider_id = ${providerId}
      ORDER BY vaccine_name ASC, id ASC
    `;

    return Response.json({ requirements });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[GET /api/providers/[id]/daycare-requirements] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to fetch daycare requirements" },
      { status: 500 },
    );
  }
}

async function POST(request, { params }) {
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

    // MODULE gate, then owner|admin (configuration is admin-only, like services).
    await requireProviderCapability(providerId, "daycare");
    await requireProviderRole(providerId, userId, ["owner", "admin"]);

    const body = (await request.json()) ?? {};
    const { vaccine_name, location_id } = body;
    const name =
      typeof vaccine_name === "string" ? vaccine_name.trim() : "";
    if (!name) {
      return Response.json(
        { error: "vaccine_name is required" },
        { status: 400 },
      );
    }

    // If a location is named it must belong to THIS provider.
    if (location_id !== undefined && location_id !== null) {
      const locRows = await sql`
        SELECT id FROM provider_locations
        WHERE id = ${location_id} AND provider_id = ${providerId}
      `;
      if (locRows.length === 0) {
        return Response.json(
          { error: "Invalid location for this provider" },
          { status: 400 },
        );
      }
    }

    const created = await sql`
      INSERT INTO daycare_requirements (provider_id, location_id, vaccine_name, active)
      VALUES (${providerId}, ${location_id ?? null}, ${name}, true)
      RETURNING *
    `;

    return Response.json({ requirement: created[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[POST /api/providers/[id]/daycare-requirements] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to add daycare requirement" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler bodies are
// unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
