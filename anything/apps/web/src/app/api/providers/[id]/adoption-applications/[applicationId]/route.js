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
import { safeNotify } from "@/app/api/utils/notify";

// The applicant-facing notification type for each shelter-driven transition (0086 widened the
// notifications type CHECK to allow these). subject_ref = the application id → tap-through to the
// owner's Applications list. Pre-migration the type isn't allowed yet; safeNotify swallows the
// CHECK failure (fire-and-forget), so a status change never 500s.
const ADOPTION_NOTIFY_TYPE = {
  under_review: "adoption_under_review",
  approved: "adoption_approved",
  declined: "adoption_declined",
};

// PATCH /api/providers/[id]/adoption-applications/[applicationId] — the SHELTER reviews one
// application. Phase 2 ticket 2.12.
//
// status transitions the shelter can drive: under_review, declined, and approved. APPROVAL is
// special — it doesn't just flip a status: it CREATES the adopter's new pet (the transfer) and
// marks the listing 'adopted', all atomically, via the app_approve_adoption(application_id)
// SECURITY DEFINER helper (0038). Approval is the ONLY path that creates a pet owned by
// someone else, and the helper authorizes the caller as the place's active staff itself, so a
// non-staff caller gets a clean 403 (the helper returns NULL).
//
// Gated by requireProviderCapability(providerId,'adoption') + requireProviderRole (any active
// staff may review). adoption_applications RLS (0038) update policy is the last line for the
// non-approval transitions.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").
async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: providerId, applicationId } = params;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderCapability(providerId, "adoption");
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    const body = (await request.json()) ?? {};
    const { status } = body;
    if (!["under_review", "approved", "declined"].includes(status)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }

    // Confirm the application belongs to THIS place (RLS already scopes it to staff; the
    // provider_id filter pins it to the dashboard's place — a clean 404 otherwise). Also pull
    // the applicant id + dog name so we can notify the applicant of the decision (below).
    const appRows = await sql`
      SELECT a.id, a.status, a.applicant_owner_user_id, l.name AS listing_name
      FROM adoption_applications a
      LEFT JOIN adoptable_listings l ON l.id = a.listing_id
      WHERE a.id = ${applicationId} AND a.provider_id = ${providerId}
    `;
    if (appRows.length === 0) {
      return Response.json({ error: "Application not found" }, { status: 404 });
    }
    const applicantUserId = appRows[0].applicant_owner_user_id;
    const dogName = appRows[0].listing_name ?? null;

    // Notify the applicant of a shelter-driven transition (fire-and-forget; never blocks or
    // fails the review). subject_ref = the application id → the owner taps to their Applications.
    const notifyApplicant = () =>
      safeNotify({
        recipient: applicantUserId,
        actor: userId,
        type: ADOPTION_NOTIFY_TYPE[status],
        subjectRef: String(applicationId),
        body: JSON.stringify({ dog: dogName }),
      });

    // APPROVAL → the transfer. The DEFINER helper creates the adopter's pet, links it, marks
    // the application approved + the listing adopted, atomically. Returns the new pet id, or
    // NULL if not authorized / not approvable.
    if (status === "approved") {
      const result = await sql`
        SELECT app_approve_adoption(${applicationId}) AS pet_id
      `;
      const petId = result?.[0]?.pet_id ?? null;
      if (petId === null) {
        return Response.json(
          { error: "Application is not approvable (already decided?) or not authorized" },
          { status: 409 },
        );
      }
      const refreshed = await sql`
        SELECT id, listing_id, provider_id, applicant_owner_user_id, status,
               transferred_pet_id, created_at, updated_at
        FROM adoption_applications WHERE id = ${applicationId}
      `;
      await notifyApplicant();
      return Response.json({ application: refreshed[0], transferred_pet_id: petId });
    }

    // under_review / declined — a plain status update under the RLS update policy (this
    // place's staff). RLS + provider_id scope the row; a non-staff update touches ZERO rows.
    const updated = await sql`
      UPDATE adoption_applications
      SET status = ${status}, updated_at = now()
      WHERE id = ${applicationId} AND provider_id = ${providerId}
      RETURNING id, listing_id, provider_id, applicant_owner_user_id, status,
                transferred_pet_id, created_at, updated_at
    `;
    if (updated.length === 0) {
      return Response.json({ error: "Application not found" }, { status: 404 });
    }

    await notifyApplicant();
    return Response.json({ application: updated[0] });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[PATCH /api/providers/[id]/adoption-applications/[applicationId]] Error:",
      e?.message,
    );
    return Response.json({ error: "Failed to update application" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
