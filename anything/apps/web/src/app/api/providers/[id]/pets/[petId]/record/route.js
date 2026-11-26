import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  assertCareAccess,
  CareAccessError,
  findSectionGrant,
  recordCareAccess,
  RECORD_SECTIONS,
} from "@/app/api/utils/careAccess";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/providers/[id]/pets/[petId]/record — provider staff read a pet's
// shared medical record. Ticket 8 (docs/provider-design.md §4 item 8).
//
// Two kinds of grant open this route, both through utils/careAccess, which also
// writes the one audit row. This route does NOT call requireProviderRole.
//
//   • A `medical_read` grant (assertCareAccess): the medical profile, vet notes
//     and vaccinations, with `sharedSections: null`.
//   • A grant by section (findSectionGrant, docs/vet-sharing-design.md): only the
//     sections the owner chose, listed in `sharedSections`; everything else is
//     empty. Read only.
//
// A revoked, expired or missing grant is a 403 on the very next request, with no
// extra wiring.
//
// Returns record data only — no social/feed data. DB is porsager's
// tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every query is a tagged
// template; params bind via `${}`.

// The record as a grant by section sees it. Only the granted sections are queried.
// The medical profile, emergency contact and insurance share one table, so they are
// read through app_shared_medical_profile, which returns only the granted columns
// (never a direct select on that table).
async function readSharedRecord(petId, providerId, grantedSections) {
  const sharedSections = RECORD_SECTIONS.filter((s) =>
    grantedSections.includes(s),
  );
  const has = (section) => sharedSections.includes(section);

  const medicalProfileRows =
    has("profile") || has("emergency_contact") || has("insurance")
      ? await sql`
          SELECT * FROM app_shared_medical_profile(${petId}::int, ${providerId}::int)
        `
      : [];
  const notes = has("vet_notes")
    ? await sql`
        SELECT * FROM vet_notes
        WHERE pet_id = ${petId}
        ORDER BY note_date DESC, created_at DESC
      `
    : [];
  const vaccinations = has("vaccines")
    ? await sql`
        SELECT * FROM pet_vaccinations
        WHERE pet_id = ${petId} AND deleted_at IS NULL
        ORDER BY date_given DESC NULLS LAST, created_at DESC
      `
    : [];
  const documents = has("files")
    ? await sql`
        SELECT * FROM vet_documents
        WHERE pet_id = ${petId}
        ORDER BY document_date DESC NULLS LAST, created_at DESC
      `
    : [];
  const photoChecks = has("photos")
    ? await sql`
        SELECT * FROM health_photo_checks
        WHERE pet_id = ${petId}
        ORDER BY created_at DESC
      `
    : [];
  const labResults = has("lab_results")
    ? await sql`
        SELECT * FROM pet_lab_results
        WHERE pet_id = ${petId}
        ORDER BY test_date DESC, created_at DESC
      `
    : [];

  return {
    sharedSections,
    medical_profile: medicalProfileRows[0] ?? null,
    notes,
    vaccinations,
    documents,
    photo_checks: photoChecks,
    lab_results: labResults,
  };
}

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

    // Gate 1: active staff + active grant covering medical_read. Throws
    // CareAccessError(403) on any denial and writes the audit row on success.
    try {
      await assertCareAccess(petId, providerId, "medical_read", {
        staffUserId,
        action: "read",
        resource: "medical_record",
      });
    } catch (e) {
      if (!(e instanceof CareAccessError)) throw e;
      // Gate 2: a grant by section. Neither → the denial above stands.
      const grant = await findSectionGrant(petId, providerId, staffUserId);
      if (!grant) throw e;
      await recordCareAccess(grant.id, staffUserId, "read", "medical_record");
      return Response.json(
        await readSharedRecord(petId, providerId, grant.sections),
      );
    }

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
      sharedSections: null,
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

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
