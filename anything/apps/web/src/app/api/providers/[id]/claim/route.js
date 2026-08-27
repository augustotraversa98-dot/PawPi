import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId, ensureUserProfile } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/providers/[id]/claim — mobile "¿Es tu negocio? Reclamalo".
//
// The caller declares that they own the seeded business at :id and opens a claim
// for admin review (0125). No ownership changes here — that only happens at
// admin approval time, through app_claim_provider (SECURITY DEFINER).
//
// AUTH: any authenticated user, and their user_profiles row is lazily created (a
// fresh signup can claim a business on their very first session, same shape as
// POST /api/providers).
//
// PRECONDITIONS:
//   1. The provider must exist AND be publicly visible under the caller (0024
//      public-reads status='published'). A draft/hidden provider → 404.
//   2. The provider must currently be claim_status='unclaimed'. An already-
//      claimed or already-pending provider → 409 (fail-loud so the mobile UI
//      can show the right state — "pending review" vs "already claimed").
//
// IDEMPOTENCY: if the caller ALREADY has an open (pending) claim on this
// provider, the same row is returned with 200 (no duplicate INSERT — the RLS
// INSERT policy would allow it, but the UNIQUE(provider_id, claimant) constraint
// would reject it). If the caller previously had a rejected/withdrawn claim,
// re-opening is done by UPDATEing that row back to 'pending'.
//
// BODY: { method?: 'phone'|'email'|'document'|'other', note?: string, evidence?: object }.
// method + note + evidence are optional; the MVP is manual admin review.
async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const providerId = Number(params?.id);
    if (!Number.isInteger(providerId) || providerId <= 0) {
      return Response.json({ error: "Invalid provider id" }, { status: 400 });
    }

    const userId = await ensureUserProfile(session.user.id, {
      fullName: session.user.name,
      email: session.user.email,
    });

    let body = null;
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const rawMethod = typeof body?.method === "string" ? body.method.trim() : null;
    const method =
      rawMethod && ["phone", "email", "document", "other"].includes(rawMethod)
        ? rawMethod
        : null;
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 2000) : null;
    const evidence =
      body?.evidence && typeof body.evidence === "object" && !Array.isArray(body.evidence)
        ? body.evidence
        : null;

    // Precondition — the provider is visible to the caller AND unclaimed. Runs under
    // the caller's identity (withRequestContext), so a hidden provider naturally 404s.
    const rows = await sql`
      SELECT id, claim_status FROM providers WHERE id = ${providerId} LIMIT 1
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }
    if (rows[0].claim_status !== "unclaimed") {
      return Response.json(
        {
          error:
            rows[0].claim_status === "claimed"
              ? "This business has already been claimed."
              : "A claim is already pending on this business.",
          claim_status: rows[0].claim_status,
        },
        { status: 409 },
      );
    }

    // Was there a previous claim by THIS user (rejected/withdrawn)? Re-open it.
    const existing = await sql`
      SELECT id, status FROM provider_claims
      WHERE provider_id = ${providerId} AND claimant_user_profile_id = ${userId}
      LIMIT 1
    `;
    if (existing.length > 0) {
      if (existing[0].status === "pending") {
        return Response.json({ claim: existing[0], reused: true }, { status: 200 });
      }
      const [updated] = await sql`
        UPDATE provider_claims
        SET status = 'pending',
            method = ${method},
            evidence = ${evidence == null ? null : sql.json(evidence)},
            note = ${note},
            created_at = now(),
            decided_at = null,
            decided_by = null
        WHERE id = ${existing[0].id}
        RETURNING id, provider_id, claimant_user_profile_id, status, method, note, created_at
      `;
      return Response.json({ claim: updated, reused: true }, { status: 200 });
    }

    const inserted = await sql`
      INSERT INTO provider_claims (provider_id, claimant_user_profile_id, status, method, note, evidence)
      VALUES (${providerId}, ${userId}, 'pending', ${method}, ${note}, ${evidence == null ? null : sql.json(evidence)})
      RETURNING id, provider_id, claimant_user_profile_id, status, method, note, created_at
    `;
    return Response.json({ claim: inserted[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/providers/[id]/claim] Error:", error.message);
    return Response.json({ error: "Failed to open claim" }, { status: 500 });
  }
}

// GET /api/providers/[id]/claim — the caller's OWN claim on this provider, if any
// (drives the mobile "claim pending" state without a client-side scan of /claims/mine).
// Returns 404 when the caller has no claim on this provider.
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const providerId = Number(params?.id);
    if (!Number.isInteger(providerId) || providerId <= 0) {
      return Response.json({ error: "Invalid provider id" }, { status: 400 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId == null) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const rows = await sql`
      SELECT id, provider_id, claimant_user_profile_id, status, method, note, created_at, decided_at
      FROM provider_claims
      WHERE provider_id = ${providerId} AND claimant_user_profile_id = ${userId}
      LIMIT 1
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ claim: rows[0] });
  } catch (error) {
    console.error("[GET /api/providers/[id]/claim] Error:", error.message);
    return Response.json({ error: "Failed to load claim" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
const wrappedGET = withRequestContext(GET);
export { wrappedPOST as POST, wrappedGET as GET };
