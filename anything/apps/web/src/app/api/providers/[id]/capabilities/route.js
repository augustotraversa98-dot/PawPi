import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import {
  requireProviderRole,
  ALL_PROVIDER_ROLES,
  ALLOWED_CAPABILITIES,
} from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Provider capabilities — list (any active staff), add (owner|admin), remove
// (owner|admin). Ticket 2.1 (docs/phase2-tickets/2.1-provider-capabilities.md): a
// provider offers MANY capabilities; this is the management endpoint behind the
// onboarding multi-select. Identity resolves auth_users.id -> user_profiles.id like the
// other provider routes; authorization is by provider_staff membership via
// requireProviderRole. Every write validates against ALLOWED_CAPABILITIES (a bad value
// is a 400, not a DB CHECK 500). Capability ≠ data access — this never touches consent.

// List this provider's capabilities — any active staff.
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

    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    const rows = await sql`
      SELECT capability FROM provider_capabilities
      WHERE provider_id = ${providerId}
      ORDER BY capability ASC
    `;

    return Response.json({ capabilities: rows.map((r) => r.capability) });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[GET /api/providers/[id]/capabilities] Error:", error.message);
    return Response.json(
      { error: "Failed to fetch capabilities" },
      { status: 500 },
    );
  }
}

// Add a capability to this provider — owner|admin only. Idempotent (ON CONFLICT).
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

    await requireProviderRole(providerId, userId);

    const body = (await request.json()) ?? {};
    const { capability } = body;

    if (!capability) {
      return Response.json({ error: "capability is required" }, { status: 400 });
    }
    if (!ALLOWED_CAPABILITIES.includes(capability)) {
      return Response.json(
        { error: `Invalid capability: ${capability}` },
        { status: 400 },
      );
    }

    await sql`
      INSERT INTO provider_capabilities (provider_id, capability)
      VALUES (${providerId}, ${capability})
      ON CONFLICT (provider_id, capability) DO NOTHING
    `;

    const rows = await sql`
      SELECT capability FROM provider_capabilities
      WHERE provider_id = ${providerId}
      ORDER BY capability ASC
    `;

    return Response.json(
      { capabilities: rows.map((r) => r.capability) },
      { status: 201 },
    );
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[POST /api/providers/[id]/capabilities] Error:", error.message);
    return Response.json(
      { error: "Failed to add capability" },
      { status: 500 },
    );
  }
}

// Remove a capability from this provider — owner|admin only. The capability to remove
// comes from ?capability=<cap> (DELETE has no body convention here).
async function DELETE(request, { params }) {
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

    await requireProviderRole(providerId, userId);

    const { searchParams } = new URL(request.url);
    const capability = searchParams.get("capability");

    if (!capability) {
      return Response.json(
        { error: "capability query param is required" },
        { status: 400 },
      );
    }
    if (!ALLOWED_CAPABILITIES.includes(capability)) {
      return Response.json(
        { error: `Invalid capability: ${capability}` },
        { status: 400 },
      );
    }

    await sql`
      DELETE FROM provider_capabilities
      WHERE provider_id = ${providerId} AND capability = ${capability}
    `;

    const rows = await sql`
      SELECT capability FROM provider_capabilities
      WHERE provider_id = ${providerId}
      ORDER BY capability ASC
    `;

    return Response.json({ capabilities: rows.map((r) => r.capability) });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[DELETE /api/providers/[id]/capabilities] Error:", error.message);
    return Response.json(
      { error: "Failed to remove capability" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler bodies are
// unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedGET as GET, wrappedPOST as POST, wrappedDELETE as DELETE };
