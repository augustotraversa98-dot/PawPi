import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { requireProviderRole } from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { refund } from "@/app/api/utils/payments";
import { PaymentsNotConfiguredError } from "@/app/api/utils/payments/config";

// POST /api/payments/[id]/refund — refund a payment, PROVIDER-ADMIN scoped (ticket 2.3).
// Only owner|admin of the provider on the underlying order may refund. We resolve the
// payment → its order → its provider, then requireProviderRole(provider, me) before
// calling the provider-agnostic refund (which hits the rail then flips the ledger +
// order). Missing key → 503; not authorized → 403.
async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const rows = await sql`
      SELECT p.*, o.provider_id
      FROM payments p
      JOIN orders o ON o.id = p.order_id
      WHERE p.id = ${params.id}
      LIMIT 1
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Payment not found" }, { status: 404 });
    }
    const payment = rows[0];

    // owner|admin of the provider only.
    await requireProviderRole(payment.provider_id, userId);

    const result = await refund(payment);
    return Response.json({ status: result.status });
  } catch (error) {
    if (error instanceof PaymentsNotConfiguredError || error.status === 503) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[POST /api/payments/[id]/refund] Error:", error.message);
    return Response.json({ error: "Failed to refund payment" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
