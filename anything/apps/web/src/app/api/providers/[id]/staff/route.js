import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { requireProviderRole } from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";

// Provider staff — invite an existing user (owner|admin). Ticket 4c
// (docs/provider-design.md §4 item 4, the staff half). Identity resolves
// auth_users.id -> user_profiles.id like the 4a/4b routes; authorization is by
// provider_staff membership via requireProviderRole, scoped to the path :id.
//
// The invitee is identified by their UNIQUE user_profiles.username and resolved
// to a user_profiles.id. An invite creates a provider_staff row with
// status='invited'; the invitee themselves flips it to 'active' via the accept
// route (which does NOT use requireProviderRole — they aren't active staff yet).

// 'owner' is set only at provider creation (4a) and is never invitable — there is
// no ownership transfer in the MVP. An invite may only grant admin/staff/vet.
const INVITABLE_ROLES = ["admin", "staff", "vet"];

// Invite an existing user to this provider — owner|admin only.
export async function POST(request, { params }) {
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
    const { username, role } = body;

    if (!username) {
      return Response.json({ error: "username is required" }, { status: 400 });
    }
    // 'owner' (and any unknown role) is rejected — only admin/staff/vet invitable.
    if (!INVITABLE_ROLES.includes(role)) {
      return Response.json(
        { error: "role must be one of admin, staff, vet" },
        { status: 400 },
      );
    }

    // Resolve the invitee by their unique username.
    const invitee = await sql`
      SELECT id FROM user_profiles WHERE username = ${username} LIMIT 1
    `;
    if (invitee.length === 0) {
      return Response.json({ error: "Invitee not found" }, { status: 404 });
    }
    const inviteeId = invitee[0].id;

    // UNIQUE(provider_id, user_profile_id): inspect any existing membership.
    const existing = await sql`
      SELECT id, status FROM provider_staff
      WHERE provider_id = ${providerId} AND user_profile_id = ${inviteeId}
      LIMIT 1
    `;

    if (existing.length > 0) {
      const row = existing[0];
      // An active or still-pending membership cannot be re-invited.
      if (row.status === "active" || row.status === "invited") {
        return Response.json(
          { error: "User is already a member or invited" },
          { status: 409 },
        );
      }
      // A previously-removed member is RE-INVITED in place — flip the existing
      // row back to 'invited' with the new role (no duplicate insert).
      const reinvited = await sql`
        UPDATE provider_staff
        SET role = ${role}, status = 'invited', updated_at = NOW()
        WHERE id = ${row.id}
        RETURNING *
      `;
      return Response.json({ staff: reinvited[0] }, { status: 201 });
    }

    const created = await sql`
      INSERT INTO provider_staff (provider_id, user_profile_id, role, status)
      VALUES (${providerId}, ${inviteeId}, ${role}, 'invited')
      RETURNING *
    `;

    return Response.json({ staff: created[0] }, { status: 201 });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[POST /api/providers/[id]/staff] Error:", error.message);
    return Response.json({ error: "Failed to invite staff" }, { status: 500 });
  }
}
