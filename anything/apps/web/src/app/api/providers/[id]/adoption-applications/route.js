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

// GET /api/providers/[id]/adoption-applications — the SHELTER dashboard's application queue.
// Phase 2 ticket 2.12. Lists the place's adoption applications (with the applied-for dog +
// applicant display name) for review.
//
// Gated by requireProviderCapability(providerId,'adoption') + requireProviderRole (any active
// staff may review). adoption_applications RLS (0038) scopes per-row: this place's staff see
// THIS place's applications, never another place's; an applicant only ever sees their own.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").
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

    await requireProviderCapability(providerId, "adoption");
    const membership = await requireProviderRole(
      providerId,
      userId,
      ALL_PROVIDER_ROLES,
    );
    // (AUDIT A-23) The applicant's email is PII. Any active staff may REVIEW an
    // application, but only owner/admin see the raw email; regular staff/vet reach
    // the applicant through the application thread (A3) instead. The email is still
    // joined below (one column) and nulled out for non-privileged roles so the
    // shape stays stable for the shelter dashboard.
    const canSeeApplicantEmail =
      membership?.role === "owner" || membership?.role === "admin";

    // RLS scopes to this place's staff. Join the listing (the dog) + the applicant's name, and
    // the email for owner/admin only (nulled for other roles above — AUDIT A-23). Email lives on
    // auth_users (RLS-disabled identity table, 0026), joined via the profile's auth_user_id.
    // There is NO phone column on the profile, so the recommended "Best contact number" question
    // (application_questions, 0086) is the phone channel — its answer rides in `answers`. No RLS
    // change (the row-level scope is unchanged).
    const applications = await sql`
      SELECT
        a.id, a.listing_id, a.provider_id, a.applicant_owner_user_id, a.answers,
        a.status, a.transferred_pet_id, a.created_at, a.updated_at,
        l.name AS listing_name, l.breed AS listing_breed, l.status AS listing_status,
        COALESCE(up.full_name, up.username) AS applicant_name,
        au.email AS applicant_email
      FROM adoption_applications a
      LEFT JOIN adoptable_listings l ON l.id = a.listing_id
      LEFT JOIN user_profiles up ON up.id = a.applicant_owner_user_id
      LEFT JOIN auth_users au ON au.id = up.auth_user_id
      WHERE a.provider_id = ${providerId}
      ORDER BY a.created_at DESC, a.id DESC
    `;

    // (AUDIT A-23) Strip the applicant email for non owner/admin roles.
    const scoped = canSeeApplicantEmail
      ? applications
      : applications.map((a) => ({ ...a, applicant_email: null }));

    return Response.json({ applications: scoped });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[GET /api/providers/[id]/adoption-applications] Error:",
      e?.message,
    );
    return Response.json({ error: "Failed to fetch applications" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
