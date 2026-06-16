import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// PATCH /api/care-access/grants/[grantId] — the OWNER approves / denies / revokes
// a care-access grant. Ticket 7 (docs/provider-design.md §2 Consent + §4 item 7).
// This is the trust decision: it flips a grant to the 'active' status that
// assertCareAccess honors, or to 'revoked' which it does not — so approve/revoke
// are INSTANT by construction (no extra wiring; the read/write routes simply stop
// finding an active grant).
//
// OWNER-context route: authorization is the caller's own identity. The grant is
// scoped WHERE id = grantId AND owner_user_id = me; a grant that is not mine (or
// does not exist) matches no row → 404. Only the pet's owner can act here.
//
// LIFECYCLE lives on the grant row (status + granted_at/revoked_at). NO
// care_access_audit row is written — that table is append-only for data-ACCESS
// events (action read|write) only; approve/deny/revoke are not data accesses.
//
// Transitions (each illegal source → 409):
//   approve : pending  → active  (granted_at=now(); optional expiresAt → expires_at)
//   deny    : pending  → revoked (revoked_at=now())
//   revoke  : active   → revoked (revoked_at=now())
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every
// query is a tagged template; params bind via `${}`.

const VALID_ACTIONS = ["approve", "deny", "revoke"];

async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const grantId = params.grantId;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = (await request.json()) ?? {};
    const { action, expiresAt } = body;

    if (!VALID_ACTIONS.includes(action)) {
      return Response.json(
        { error: "action must be one of approve, deny, revoke" },
        { status: 400 },
      );
    }

    // Scope to MY grant. Not mine (or unknown) → 404. status drives the transition.
    const rows = await sql`
      SELECT id, status FROM care_access_grants
      WHERE id = ${grantId} AND owner_user_id = ${userId}
      LIMIT 1
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Grant not found" }, { status: 404 });
    }
    const currentStatus = rows[0].status;

    if (action === "approve") {
      // Only a pending grant can be approved.
      if (currentStatus !== "pending") {
        return Response.json(
          { error: "Only a pending grant can be approved" },
          { status: 409 },
        );
      }
      const updated = await sql`
        UPDATE care_access_grants
        SET status = ${"active"},
            granted_at = NOW(),
            expires_at = ${expiresAt ?? null},
            updated_at = NOW()
        WHERE id = ${grantId} AND owner_user_id = ${userId}
        RETURNING *
      `;
      return Response.json({ grant: updated[0] });
    }

    if (action === "deny") {
      // Only a pending grant can be denied.
      if (currentStatus !== "pending") {
        return Response.json(
          { error: "Only a pending grant can be denied" },
          { status: 409 },
        );
      }
      const updated = await sql`
        UPDATE care_access_grants
        SET status = ${"revoked"},
            revoked_at = NOW(),
            updated_at = NOW()
        WHERE id = ${grantId} AND owner_user_id = ${userId}
        RETURNING *
      `;
      return Response.json({ grant: updated[0] });
    }

    // action === "revoke" — only an active grant can be revoked.
    if (currentStatus !== "active") {
      return Response.json(
        { error: "Only an active grant can be revoked" },
        { status: 409 },
      );
    }
    const updated = await sql`
      UPDATE care_access_grants
      SET status = ${"revoked"},
          revoked_at = NOW(),
          updated_at = NOW()
      WHERE id = ${grantId} AND owner_user_id = ${userId}
      RETURNING *
    `;
    return Response.json({ grant: updated[0] });
  } catch (error) {
    console.error(
      "[PATCH /api/care-access/grants/[grantId]] Error:",
      error.message,
    );
    return Response.json(
      { error: "Failed to update grant" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
