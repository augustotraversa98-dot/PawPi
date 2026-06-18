import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// PATCH /api/providers/[id]/insurance-policies/[policyId] — the INSURER issues/advances a policy
// (Wave 7 ticket 2.72): set policy_number + premium + billing + effective, advance status, attach
// documents. Capability-gated to `insurance`; RLS (insurance_policies_staff_update) is the guard and
// FORBIDS setting 'active' via a plain UPDATE — activation runs only through activate_insurance_policy
// after a real approved payment, so a policy never goes active without payment.
//
// DB is porsager's tagged-template `sql`.
const ISSUE_STATUSES = ["application", "payment_pending", "lapsed", "cancelled"];

async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const providerId = params.id;
    const policyId = params.policyId;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    await requireProviderCapability(providerId, "insurance");

    const body = (await request.json()) ?? {};
    const {
      policy_number,
      premium_cents,
      billing_period,
      effective_at,
      status,
      documents,
    } = body;

    if (status === "active") {
      return Response.json(
        { error: "A policy can only go active through a confirmed payment" },
        { status: 400 },
      );
    }
    if (status !== undefined && !ISSUE_STATUSES.includes(status)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }
    if (
      premium_cents !== undefined &&
      premium_cents !== null &&
      !(Number.isInteger(premium_cents) && premium_cents >= 0)
    ) {
      return Response.json(
        { error: "premium_cents must be a non-negative integer" },
        { status: 400 },
      );
    }
    if (
      billing_period !== undefined &&
      billing_period !== null &&
      !["monthly", "annual"].includes(billing_period)
    ) {
      return Response.json({ error: "Invalid billing_period" }, { status: 400 });
    }

    // RLS staff_update scopes the row + forbids 'active'. A non-staff caller updates ZERO rows → 404.
    const updated = await sql`
      UPDATE insurance_policies
      SET
        policy_number = COALESCE(${policy_number ?? null}, policy_number),
        premium_cents = COALESCE(${premium_cents ?? null}, premium_cents),
        billing_period = COALESCE(${billing_period ?? null}, billing_period),
        effective_at = COALESCE(${effective_at ?? null}, effective_at),
        documents = COALESCE(${documents ? JSON.stringify(documents) : null}::jsonb, documents),
        status = COALESCE(${status ?? null}, status),
        updated_at = now()
      WHERE id = ${policyId} AND provider_id = ${providerId}
      RETURNING *
    `;
    if (updated.length === 0) {
      return Response.json(
        { error: "Policy not found or not authorized" },
        { status: 404 },
      );
    }
    return Response.json({ policy: updated[0] });
  } catch (e) {
    if (e instanceof ProviderAuthError || e.status === 403) {
      return Response.json({ error: e.message }, { status: 403 });
    }
    console.error(
      "[PATCH /api/providers/[id]/insurance-policies/[policyId]] Error:",
      e?.message,
    );
    return Response.json({ error: "Failed to update policy" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
