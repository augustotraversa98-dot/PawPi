import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { VALID_CARE_SCOPES } from "@/app/api/utils/careAccess";

// GET /api/care-access/grants — the OWNER's trust view: who has (or requested)
// access to which of my pets. Ticket 7 (docs/provider-design.md §2 + §4 item 7).
//
// This is an OWNER-context route, NOT a provider one: authorization is the
// caller's own identity (WHERE owner_user_id = me), exactly like every other
// owner-data route. It does NOT use requireProviderRole. Another owner's grants
// are invisible because they never match the WHERE clause.
//
// Returns the grant rows joined with the provider name + pet name so the trust UI
// can render "Dr. Smith — Rex" without extra lookups. Optional ?petId / ?status
// filters narrow the list. Newest first.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every
// query is a tagged template; params bind via `${}`. The optional filters are
// expressed as tagged-template booleans (never sql(string, array)).
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const petId = searchParams.get("petId");
    const status = searchParams.get("status");

    // Owner scope is the hard gate (WHERE owner_user_id = me). The optional
    // filters are folded in with `(${filter} IS NULL OR col = ${filter})` so a
    // single tagged template handles every combination without sql(string,array).
    const grants = await sql`
      SELECT
        g.id,
        g.pet_id,
        g.owner_user_id,
        g.provider_id,
        g.scopes,
        g.status,
        g.requested_by,
        g.booking_id,
        g.granted_at,
        g.expires_at,
        g.revoked_at,
        g.created_at,
        g.updated_at,
        pr.name AS provider_name,
        p.name AS pet_name
      FROM care_access_grants g
      LEFT JOIN providers pr ON pr.id = g.provider_id
      LEFT JOIN pets p ON p.id = g.pet_id
      WHERE g.owner_user_id = ${userId}
        AND (${petId}::int IS NULL OR g.pet_id = ${petId}::int)
        AND (${status}::text IS NULL OR g.status = ${status}::text)
      ORDER BY g.created_at DESC
    `;

    return Response.json({ grants });
  } catch (error) {
    console.error("[GET /api/care-access/grants] Error:", error.message);
    return Response.json(
      { error: "Failed to fetch grants" },
      { status: 500 },
    );
  }
}

// Default scope for owner-initiated "Share clinic history": READ access to the pet's clinic
// history (medical record + vaccine check). This is the exact scope assertCareAccess gates those
// endpoints on ('medical_read') — a coarse 'medical' would store fine but grant NOTHING. No
// _write scope is ever granted by this owner-facing share.
const DEFAULT_CLINIC_SCOPES = ["medical_read"];

// POST /api/care-access/grants — OWNER-INITIATED sharing (booking detail → "Share clinic
// history"). The owner is the granting authority, so this creates an ACTIVE grant directly
// (requested_by='owner', status='active') — no provider request / owner approval round-trip.
// Mirrors the access-requests column shape (pet_id, owner_user_id, provider_id, scopes, status,
// requested_by). OWNER-context: the pet must belong to the caller (another owner's pet → 404).
//
// DEDUP: if an ACTIVE, non-expired grant to this provider already COVERS the requested scopes
// (existing.scopes ⊇ requested), return it instead of inserting a duplicate.
async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = (await request.json()) ?? {};
    const { petId, providerId, scopes } = body;

    if (!petId || !providerId) {
      return Response.json(
        { error: "petId and providerId are required" },
        { status: 400 },
      );
    }

    const scopeList =
      Array.isArray(scopes) && scopes.length > 0 ? scopes : DEFAULT_CLINIC_SCOPES;

    // Validate against the SHARED care-access vocabulary assertCareAccess honors. A scope outside
    // the set could never be matched by `requiredScope = ANY (scopes)`, so we reject it up front
    // (400) rather than silently storing a grant that grants nothing — the check that would have
    // caught the original 'medical'/'vaccinations' no-op.
    if (!scopeList.every((s) => VALID_CARE_SCOPES.includes(s))) {
      return Response.json(
        { error: "scopes must all be valid care-access scope values" },
        { status: 400 },
      );
    }

    // The pet must belong to the caller — another owner's pet matches no row → 404.
    const petRows = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (petRows.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }

    // The provider must exist and be published.
    const providerRows = await sql`
      SELECT id FROM providers WHERE id = ${providerId} AND status = 'published'
    `;
    if (providerRows.length === 0) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    // Dedup: an active, non-expired grant already covering these scopes → return it, no insert.
    const existing = await sql`
      SELECT * FROM care_access_grants
      WHERE owner_user_id = ${userId}
        AND pet_id = ${petId}
        AND provider_id = ${providerId}
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > now())
        AND scopes @> ${scopeList}::text[]
      ORDER BY id DESC
      LIMIT 1
    `;
    if (existing.length > 0) {
      return Response.json({ grant: existing[0], deduped: true });
    }

    const created = await sql`
      INSERT INTO care_access_grants (
        pet_id,
        owner_user_id,
        provider_id,
        scopes,
        status,
        requested_by,
        granted_at
      ) VALUES (
        ${petId},
        ${userId},
        ${providerId},
        ${scopeList},
        ${"active"},
        ${"owner"},
        NOW()
      )
      RETURNING *
    `;

    return Response.json({ grant: created[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/care-access/grants] Error:", error.message);
    return Response.json(
      { error: "Failed to create grant" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
