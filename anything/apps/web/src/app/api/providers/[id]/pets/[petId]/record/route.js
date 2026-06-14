import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { assertCareAccess, CareAccessError } from "@/app/api/utils/careAccess";

// GET /api/providers/[id]/pets/[petId]/record — provider staff read a pet's
// shared medical record. Ticket 8 (docs/provider-design.md §4 item 8).
//
// Authorization is SOLELY assertCareAccess: it verifies active provider_staff
// membership AND an active, scope-covering care_access_grant, and writes the one
// audit row. This route does NOT call requireProviderRole and does NOT write an
// audit row itself — assertCareAccess owns auditing. A revoked/expired/missing
// grant (or missing 'medical_read' scope) makes the helper throw 403, which is
// how "removing the grant immediately blocks access" is enforced with no extra
// wiring.
//
// Returns the MEDICAL record only (profile + vet notes + vaccinations) — no
// social/feed data. DB is porsager's tagged-template `sql` (SCHEMA_NOTES
// "neon→porsager"): every query is a tagged template; params bind via `${}`.
export async function GET(request, { params }) {
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

    // The ONLY gate: active staff + active grant covering medical_read. Throws
    // CareAccessError(403) on any denial and writes the audit row on success.
    await assertCareAccess(petId, providerId, "medical_read", {
      staffUserId,
      action: "read",
      resource: "medical_record",
    });

    const medicalProfileRows = await sql`
      SELECT * FROM pet_medical_profiles
      WHERE pet_id = ${petId} AND deleted_at IS NULL
      LIMIT 1
    `;

    const notes = await sql`
      SELECT * FROM vet_notes
      WHERE pet_id = ${petId}
      ORDER BY note_date DESC, created_at DESC
    `;

    const vaccinations = await sql`
      SELECT * FROM pet_vaccinations
      WHERE pet_id = ${petId} AND deleted_at IS NULL
      ORDER BY date_given DESC NULLS LAST, created_at DESC
    `;

    return Response.json({
      medical_profile: medicalProfileRows[0] ?? null,
      notes,
      vaccinations,
    });
  } catch (e) {
    if (e instanceof CareAccessError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[GET /api/providers/[id]/pets/[petId]/record] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to load medical record" },
      { status: 500 },
    );
  }
}
