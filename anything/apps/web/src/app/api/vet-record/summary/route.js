import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { withRequestContext } from "@/app/api/utils/requestContext";

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const petId = searchParams.get("petId");

    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    // Get owner_user_id from user_profiles
    const userProfile = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;

    if (!userProfile || userProfile.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const ownerUserId = userProfile[0].id;

    // Verify pet ownership
    const pet = await sql`
      SELECT id FROM pets 
      WHERE id = ${petId} AND owner_user_id = ${ownerUserId}
    `;

    if (!pet || pet.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }

    // Fetch all counts in parallel
    const [
      allergies,
      conditions,
      medications,
      vaccines,
      upcomingAppointments,
      completedAppointments,
      surgeries,
      labResults,
      documents,
      photoChecks,
      vetNotes,
    ] = await Promise.all([
      // Allergies
      sql`
        SELECT COUNT(*)::int as count 
        FROM pet_allergies 
        WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
      `,
      // Conditions
      sql`
        SELECT COUNT(*)::int as count 
        FROM pet_conditions 
        WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
      `,
      // Current Medications (from medical care logs where care_type = medication)
      sql`
        SELECT COUNT(DISTINCT medical_care_item_id)::int as count
        FROM health_medical_care_logs
        WHERE pet_id = ${petId} 
          AND owner_user_id = ${ownerUserId}
          AND care_type = 'medication'
          AND given_at >= NOW() - INTERVAL '30 days'
      `,
      // Vaccines — "Vaccination History" reads pet_vaccinations, the vaccination
      // SSOT (0018). This counts vaccination EVENTS/records (provider-administered +
      // owner write-through + backfill), NOT distinct vaccine routine items as the
      // old health_medical_care_logs query did — so a dog vaccinated 3x reads 3, not
      // 1. Intentional semantics change (see PR body), not a regression.
      sql`
        SELECT COUNT(*)::int as count
        FROM pet_vaccinations
        WHERE pet_id = ${petId}
          AND owner_user_id = ${ownerUserId}
          AND deleted_at IS NULL
      `,
      // Upcoming Appointments
      sql`
        SELECT COUNT(*)::int as count 
        FROM vet_appointments 
        WHERE pet_id = ${petId} 
          AND owner_user_id = ${ownerUserId}
          AND status = 'scheduled'
          AND appointment_date >= CURRENT_DATE
          AND deleted_at IS NULL
      `,
      // Completed Appointments (vet visit history)
      sql`
        SELECT COUNT(*)::int as count 
        FROM vet_appointments 
        WHERE pet_id = ${petId} 
          AND owner_user_id = ${ownerUserId}
          AND (status = 'completed' OR appointment_date < CURRENT_DATE)
          AND deleted_at IS NULL
      `,
      // Surgeries
      sql`
        SELECT COUNT(*)::int as count 
        FROM pet_surgeries 
        WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
      `,
      // Lab Results
      sql`
        SELECT COUNT(*)::int as count 
        FROM pet_lab_results 
        WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
      `,
      // Documents
      sql`
        SELECT COUNT(*)::int as count 
        FROM vet_documents 
        WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
      `,
      // Photo Checks
      sql`
        SELECT COUNT(*)::int as count 
        FROM health_photo_checks 
        WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
      `,
      // Vet Notes
      sql`
        SELECT COUNT(*)::int as count 
        FROM vet_notes 
        WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
      `,
    ]);

    return Response.json({
      allergiesCount: allergies[0].count,
      conditionsCount: conditions[0].count,
      medicationsCount: medications[0].count,
      vaccinesCount: vaccines[0].count,
      upcomingAppointmentsCount: upcomingAppointments[0].count,
      completedAppointmentsCount: completedAppointments[0].count,
      surgeriesCount: surgeries[0].count,
      labResultsCount: labResults[0].count,
      documentsCount: documents[0].count,
      photoChecksCount: photoChecks[0].count,
      vetNotesCount: vetNotes[0].count,
    });
  } catch (error) {
    console.error("[Vet Record Summary] Error:", error);
    return Response.json(
      { error: "Failed to fetch vet record summary" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
