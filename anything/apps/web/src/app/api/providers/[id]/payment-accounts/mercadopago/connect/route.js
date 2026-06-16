import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { requireProviderRole } from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { buildOAuthUrl } from "@/app/api/utils/payments/mercadopago";
import { PaymentsNotConfiguredError } from "@/app/api/utils/payments/config";

// GET /api/providers/[id]/payment-accounts/mercadopago/connect — START the MercadoPago
// OAuth connect (ticket 2.3). owner|admin of the provider gets back the authorization URL
// to send the provider to; `state` binds the flow to this provider + acts as CSRF (the
// callback verifies it). Missing MP client/redirect keys → 503 (never a crash).
//
// We encode the provider id into `state` (with a random nonce) so the callback knows which
// provider_payment_accounts row to write WITHOUT a server-side session store.
async function GET(request, { params }) {
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

    const nonce = Math.random().toString(36).slice(2);
    const state = `${providerId}.${nonce}`;
    const url = buildOAuthUrl({ state });

    return Response.json({ authUrl: url, state });
  } catch (error) {
    if (error instanceof PaymentsNotConfiguredError || error.status === 503) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "[GET .../mercadopago/connect] Error:",
      error.message,
    );
    return Response.json({ error: "Failed to start connect" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
