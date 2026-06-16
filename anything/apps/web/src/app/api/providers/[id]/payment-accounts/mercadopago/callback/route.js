import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { requireProviderRole } from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { exchangeOAuthCode } from "@/app/api/utils/payments/mercadopago";
import { PaymentsNotConfiguredError } from "@/app/api/utils/payments/config";

// POST /api/providers/[id]/payment-accounts/mercadopago/callback — COMPLETE the OAuth
// connect (ticket 2.3). owner|admin posts the `code` + `state` returned by MercadoPago;
// we verify `state` binds to THIS provider (CSRF), exchange the code for the provider's
// access/refresh token, and UPSERT it into provider_payment_accounts (provider-admin RLS).
// The token is NEVER exposed to owners and never returned in the response body. Missing
// keys → 503.
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
    const { code, state } = body;
    if (!code) {
      return Response.json({ error: "code is required" }, { status: 400 });
    }
    // state binds to this provider: "<providerId>.<nonce>".
    if (!state || String(state).split(".")[0] !== String(providerId)) {
      return Response.json({ error: "Invalid state" }, { status: 400 });
    }

    const token = await exchangeOAuthCode(code);

    // UPSERT — one row per (provider, rail). Re-connecting refreshes the token.
    await sql`
      INSERT INTO provider_payment_accounts
        (provider_id, rail, access_token, refresh_token, account_ref, meta, status)
      VALUES (
        ${providerId}, 'mercadopago', ${token.accessToken}, ${token.refreshToken ?? null},
        ${token.accountRef ?? null}, ${sql.json(token.meta ?? {})}, 'connected'
      )
      ON CONFLICT (provider_id, rail) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        account_ref = EXCLUDED.account_ref,
        meta = EXCLUDED.meta,
        status = 'connected',
        updated_at = now()
    `;

    // Never return the token. Just confirm the connection + the public account ref.
    return Response.json(
      { connected: true, rail: "mercadopago", account_ref: token.accountRef ?? null },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PaymentsNotConfiguredError || error.status === 503) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "[POST .../mercadopago/callback] Error:",
      error.message,
    );
    return Response.json({ error: "Failed to complete connect" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
