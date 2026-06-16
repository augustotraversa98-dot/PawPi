import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { requireProviderRole } from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// One provider staff member — remove (soft) and change role (owner|admin).
// Ticket 4c.
//
// CROSS-PROVIDER ISOLATION: both writes look up the target row scoped by BOTH the
// path provider :id AND the userProfileId (WHERE provider_id = ${providerId} AND
// user_profile_id = ${userProfileId}). Authorizing on :id alone is not enough — a
// legit owner of provider A could otherwise touch provider B's membership by
// passing A as :id and B's member as userProfileId. A member that doesn't belong
// to :id matches no row -> 404 (same footgun as 4b's child routes).
//
// The owner is protected on both paths: it can never be removed (would orphan the
// provider) and its role can never be changed (no ownership transfer in the MVP).

// New role on a PATCH may only be admin/staff/vet — 'owner' is set only at
// provider creation (4a) and is never assignable here.
const ASSIGNABLE_ROLES = ["admin", "staff", "vet"];

// Look up the target membership scoped to the path provider + the member id.
// Returns the row or null (null => not a member of THIS provider -> 404).
async function findMembership(providerId, userProfileId) {
  const rows = await sql`
    SELECT id, role, status FROM provider_staff
    WHERE provider_id = ${providerId} AND user_profile_id = ${userProfileId}
    LIMIT 1
  `;
  return rows.length === 0 ? null : rows[0];
}

// Remove a member — owner|admin only. SOFT delete: status='removed' (asserts an
// UPDATE, not a row delete — preserves history + the unique row for re-invite).
async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const userProfileId = params.userProfileId;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderRole(providerId, userId);

    const member = await findMembership(providerId, userProfileId);
    if (member === null) {
      return Response.json({ error: "Member not found" }, { status: 404 });
    }
    // Never orphan the provider — the owner cannot be removed.
    if (member.role === "owner") {
      return Response.json(
        { error: "The owner cannot be removed" },
        { status: 403 },
      );
    }

    const removed = await sql`
      UPDATE provider_staff
      SET status = 'removed', updated_at = NOW()
      WHERE provider_id = ${providerId} AND user_profile_id = ${userProfileId}
      RETURNING *
    `;

    return Response.json({ staff: removed[0] });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "[DELETE /api/providers/[id]/staff/[userProfileId]] Error:",
      error.message,
    );
    return Response.json({ error: "Failed to remove staff" }, { status: 500 });
  }
}

// Change a member's role — owner|admin only. Guards: cannot set role='owner'
// (no ownership transfer); cannot change the owner's role.
async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const userProfileId = params.userProfileId;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderRole(providerId, userId);

    const body = (await request.json()) ?? {};
    const { role } = body;

    // 'owner' (and any unknown role) is rejected as a target role.
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return Response.json(
        { error: "role must be one of admin, staff, vet" },
        { status: 400 },
      );
    }

    const member = await findMembership(providerId, userProfileId);
    if (member === null) {
      return Response.json({ error: "Member not found" }, { status: 404 });
    }
    // The owner's role is immutable — no ownership transfer in the MVP.
    if (member.role === "owner") {
      return Response.json(
        { error: "The owner's role cannot be changed" },
        { status: 400 },
      );
    }

    const updated = await sql`
      UPDATE provider_staff
      SET role = ${role}, updated_at = NOW()
      WHERE provider_id = ${providerId} AND user_profile_id = ${userProfileId}
      RETURNING *
    `;

    return Response.json({ staff: updated[0] });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "[PATCH /api/providers/[id]/staff/[userProfileId]] Error:",
      error.message,
    );
    return Response.json({ error: "Failed to change role" }, { status: 500 });
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedDELETE = withRequestContext(DELETE);
const wrappedPATCH = withRequestContext(PATCH);
export { wrappedDELETE as DELETE, wrappedPATCH as PATCH };
