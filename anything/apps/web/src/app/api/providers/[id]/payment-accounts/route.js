import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { requireProviderRole } from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/providers/[id]/payment-accounts — connection STATUS of each payment rail
// for this provider, so the Sales dashboard can show "connected / not connected" and
// gate the "Connect MercadoPago" button (the connect flow itself lives in the
// mercadopago/connect + mercadopago/callback routes). owner|admin only, via
// requireProviderRole.
//
// SECURITY: the access/refresh tokens are NEVER selected here — only the public
// account_ref (payout handle) + status + updated_at. This endpoint exists purely to
// tell the UI whether a rail is linked.
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

    await requireProviderRole(providerId, userId);

    const rows = await sql`
      SELECT rail, account_ref, status, updated_at
      FROM provider_payment_accounts
      WHERE provider_id = ${providerId}
    `;

    // Key by rail so the UI can read status.mercadopago directly. connected is true
    // only once the callback has stored a token and flipped status to 'connected'.
    const accounts = {};
    for (const row of rows) {
      accounts[row.rail] = {
        connected: row.status === "connected",
        account_ref: row.account_ref ?? null,
        status: row.status,
        updated_at: row.updated_at ?? null,
      };
    }

    return Response.json({ accounts });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "[GET /api/providers/[id]/payment-accounts] Error:",
      error.message,
    );
    return Response.json(
      { error: "Failed to fetch payment accounts" },
      { status: 500 },
    );
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
