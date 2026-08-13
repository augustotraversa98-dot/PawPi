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

// POST /api/providers/[id]/adoption-applications/[applicationId]/thread — the SHELTER opens (or
// reuses) a chat thread WITH the applicant, from the mobile business adoption review screen
// (ticket A3, A2 follow-up). This is the only PROVIDER-initiated thread start: /api/threads is
// owner-initiated (the caller becomes owner). Here the thread's owner is the APPLICANT and the
// caller is the provider's active staff.
//
// Why this is safe with NO migration / NO RLS change: message_threads RLS
// (message_threads_participant_all, 0031) already permits an active-staff INSERT
// (WITH CHECK owner_user_id = current_app_user_id() OR app_is_active_staff_of(provider_id)); the
// caller here is active staff of provider_id, so the INSERT with the applicant as owner is allowed.
// Idempotent via the existing partial unique index idx_message_threads_unique_general
// (owner_user_id, provider_id) WHERE booking_id IS NULL — at most one general thread per pair.
//
// The APPLICANT RELATIONSHIP is the authorization: staff may only open a thread with someone who
// applied to THIS place (the application, scoped by provider_id, is loaded first). Staff cannot
// cold-message arbitrary users through this route.
//
// Gated exactly like the PATCH sibling: requireProviderCapability(id,'adoption') +
// requireProviderRole (any active staff) + withRequestContext. Non-integer id/applicationId → 404
// BEFORE any SQL (a bad path never reaches an integer column comparison).
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").
async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = Number(params.id);
    const applicationId = Number(params.applicationId);
    // 404 a non-integer id/applicationId before touching SQL (never feed a bad value to an
    // integer column comparison → clean 404 instead of a 500).
    if (!Number.isInteger(providerId) || !Number.isInteger(applicationId)) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderCapability(providerId, "adoption");
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    // The application must belong to THIS place (RLS already scopes it to staff; the provider_id
    // filter pins it to the dashboard's place). Its applicant is the thread's owner.
    const appRows = await sql`
      SELECT id, applicant_owner_user_id
      FROM adoption_applications
      WHERE id = ${applicationId} AND provider_id = ${providerId}
    `;
    if (appRows.length === 0) {
      return Response.json({ error: "Application not found" }, { status: 404 });
    }
    const applicantUserId = appRows[0].applicant_owner_user_id;

    // Reuse the existing general thread (idempotent, double-tap safe). The partial unique index
    // guarantees at most one general thread per (owner, provider).
    const existing = await sql`
      SELECT id, owner_user_id, provider_id, booking_id, created_at, last_message_at
      FROM message_threads
      WHERE owner_user_id = ${applicantUserId}
        AND provider_id = ${providerId}
        AND booking_id IS NULL
    `;
    if (existing.length > 0) {
      return Response.json({ thread: existing[0], reused: true });
    }

    // INSERT with the applicant as owner — allowed because the caller is active staff of
    // provider_id (the participant WITH CHECK).
    const created = await sql`
      INSERT INTO message_threads (owner_user_id, provider_id, booking_id)
      VALUES (${applicantUserId}, ${providerId}, NULL)
      RETURNING id, owner_user_id, provider_id, booking_id, created_at, last_message_at
    `;
    return Response.json({ thread: created[0], reused: false }, { status: 201 });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[POST /api/providers/[id]/adoption-applications/[applicationId]/thread] Error:",
      e?.message,
    );
    return Response.json({ error: "Failed to open thread" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
