import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/admin/provider-claims/[id]/decision — admin approves or rejects one
// claim (0125). Body: { decision: 'approve' | 'reject', note?: string }.
//
// Approve routes through app_claim_provider (SECURITY DEFINER) which:
//   • flips the provider's owner_user_profile_id + claim_status='claimed' +
//     claimed_at, and
//   • upserts the claimant as an active 'owner' in provider_staff, and
//   • marks THIS claim approved, and
//   • auto-rejects every other pending claim on the same provider.
//
// Reject is a plain UPDATE — provider_claims' UPDATE policy already opens to
// admins via app_is_admin().
//
// AUTH: session + user_profiles.is_admin (or role='admin') required (403 otherwise);
// the DEFINER function re-checks admin server-side as defense in depth.
async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const claimId = Number(params?.id);
    if (!Number.isInteger(claimId) || claimId <= 0) {
      return Response.json({ error: "Invalid claim id" }, { status: 400 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId == null) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const [{ is_admin }] = await sql`SELECT app_is_admin() AS is_admin`;
    if (!is_admin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    let body = null;
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const decision = typeof body?.decision === "string" ? body.decision : null;
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 2000) : null;
    if (decision !== "approve" && decision !== "reject") {
      return Response.json(
        { error: "decision must be 'approve' or 'reject'" },
        { status: 400 },
      );
    }

    // Snapshot current shape so we can 404 / 409 with a real message before touching
    // rows (the DEFINER function raises 22023 with a message string — this makes the
    // failure modes explicit at the HTTP layer).
    const [existing] = await sql`
      SELECT id, status, provider_id FROM provider_claims WHERE id = ${claimId} LIMIT 1
    `;
    if (!existing) {
      return Response.json({ error: "Claim not found" }, { status: 404 });
    }
    if (existing.status !== "pending") {
      return Response.json(
        {
          error: `Claim is ${existing.status}; only pending claims can be decided.`,
          status: existing.status,
        },
        { status: 409 },
      );
    }

    if (decision === "approve") {
      await sql`SELECT app_claim_provider(${claimId}::int, ${userId}::int)`;
      const [claim] = await sql`
        SELECT id, provider_id, claimant_user_profile_id, status,
               decided_at, decided_by
        FROM provider_claims WHERE id = ${claimId}
      `;
      return Response.json({ claim });
    }

    // reject
    const [claim] = await sql`
      UPDATE provider_claims
      SET status = 'rejected',
          decided_at = now(),
          decided_by = ${userId},
          note = COALESCE(${note}, note)
      WHERE id = ${claimId}
      RETURNING id, provider_id, claimant_user_profile_id, status, decided_at, decided_by
    `;
    return Response.json({ claim });
  } catch (error) {
    console.error(
      "[POST /api/admin/provider-claims/[id]/decision] Error:",
      error.message,
    );
    return Response.json({ error: "Failed to decide claim" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
