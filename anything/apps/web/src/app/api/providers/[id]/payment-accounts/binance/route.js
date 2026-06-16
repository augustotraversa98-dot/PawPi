import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { requireProviderRole } from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/providers/[id]/payment-accounts/binance — capture the provider's Binance Pay
// handle (ticket 2.3). Binance Pay has no per-provider OAuth like MercadoPago: payouts go
// to the provider's Binance ID, so owner|admin records that handle here. Stored in
// provider_payment_accounts (provider-admin RLS) and never exposed to owners.
//
// account_ref holds the public Binance ID/handle (payout target). There is no secret
// token for the provider on this rail (the platform merchant keys are env-only), so this
// is just the handle capture the ticket calls for.
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
    const providerId = params.id;
    await requireProviderRole(providerId, userId);

    const body = (await request.json()) ?? {};
    const { binance_id } = body;
    if (!binance_id) {
      return Response.json({ error: "binance_id is required" }, { status: 400 });
    }

    await sql`
      INSERT INTO provider_payment_accounts (provider_id, rail, account_ref, status)
      VALUES (${providerId}, 'binance', ${binance_id}, 'connected')
      ON CONFLICT (provider_id, rail) DO UPDATE SET
        account_ref = EXCLUDED.account_ref,
        status = 'connected',
        updated_at = now()
    `;

    return Response.json(
      { connected: true, rail: "binance", account_ref: binance_id },
      { status: 201 },
    );
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[POST .../binance] Error:", error.message);
    return Response.json({ error: "Failed to save Binance account" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
