import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { assertCareAccess, CareAccessError } from "@/app/api/utils/careAccess";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/providers/[id]/pets/[petId]/vaccine-check — the FACILITY verifies a pet's
// vaccinations cover its required vaccines (at booking / check-in). Phase 2 ticket 2.8
// (docs/phase2-tickets/2.8-daycare-boarding.md).
//
// ════════════════════════════════════════════════════════════════════════════════
// CONSENT, NOT BYPASS — the ticket's hard DO-NOT.
// ════════════════════════════════════════════════════════════════════════════════
// pet_vaccinations is OWNER-private medical data. The FACILITY can only read it through a
// care_access_grant. This route enforces, in order (none bypassed):
//   1. requireProviderCapability(providerId, 'daycare') — the MODULE gate (2.1).
//   2. assertCareAccess(petId, providerId, 'medical_read', …) — the PET-DATA gate: active
//      staff + an active grant whose scopes include 'medical_read'. WITHOUT the grant this
//      throws CareAccessError(403) → the facility sees "needs consent", NOT a vaccine list
//      and NOT a fake pass. Writes the care_access_audit row (every medical read is logged).
//   3. ONLY THEN does it read pet_vaccinations and compute pass/fail + missing vaccines
//      against this provider's daycare_requirements.
//
// pet_vaccinations stays the SSOT — the result is computed and returned, never persisted as
// a parallel copy. Optional ?location_id= scopes the requirements to a specific location
// (provider-wide requirements always apply).
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
    const petId = params.petId;
    const staffUserId = await resolveUserId(session.user.id);
    if (staffUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("location_id");

    // GATE 1 — the provider must HOLD the 'daycare' capability (2.1). 403 if not.
    await requireProviderCapability(providerId, "daycare");

    // GATE 2 — the MEDICAL-READ consent gate. assertCareAccess throws 403 WITHOUT an
    // active medical_read grant; the facility must obtain owner consent first. Audited.
    await assertCareAccess(petId, providerId, "medical_read", {
      staffUserId,
      action: "read",
      resource: `pet_vaccinations:${petId}`,
    });

    // The facility's ACTIVE requirements for this stay: provider-wide OR this location.
    const reqs = await sql`
      SELECT DISTINCT lower(vaccine_name) AS name, vaccine_name AS display
      FROM daycare_requirements
      WHERE provider_id = ${providerId}
        AND active = true
        AND (location_id IS NULL OR location_id = ${locationId ?? null})
    `;
    const required = reqs.map((r) => r.display);
    if (required.length === 0) {
      return Response.json({
        required: [],
        passed: true,
        missing: [],
        vaccinations: [],
      });
    }

    // The pet's CURRENT vaccinations (not soft-deleted; not expired) — read UNDER the
    // grant just asserted.
    const vax = await sql`
      SELECT id, name, date_given, expires_on
      FROM pet_vaccinations
      WHERE pet_id = ${petId}
        AND deleted_at IS NULL
        AND (expires_on IS NULL OR expires_on >= CURRENT_DATE)
      ORDER BY name ASC
    `;
    const have = new Set(vax.map((v) => v.name.toLowerCase()));
    const missing = required.filter((r) => !have.has(r.toLowerCase()));

    return Response.json({
      required,
      passed: missing.length === 0,
      missing,
      vaccinations: vax,
    });
  } catch (e) {
    if (e instanceof ProviderAuthError || e instanceof CareAccessError) {
      // CareAccessError(403) = "needs consent" — the facility must ask the owner to share
      // vaccinations before the check can run. Surface the message so the UI can prompt.
      return Response.json(
        { error: e.message, needs_consent: e instanceof CareAccessError },
        { status: e.status ?? 403 },
      );
    }
    console.error(
      "[GET /api/providers/[id]/pets/[petId]/vaccine-check] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to verify vaccinations" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler bodies are
// unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
