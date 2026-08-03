import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { requireProviderRole } from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// DELETE /api/providers/[id]/payment-accounts/mercadopago — DISCONNECT MercadoPago for
// this provider (owner|admin only). Additive counterpart to the connect + callback routes.
//
// WHY: a stored token can become UNUSABLE (e.g. PAYMENTS_TOKEN_KEY rotated so it no longer
// decrypts, or the provider revoked the app on MercadoPago's side). There was no way to
// replace it — the connect callback UPSERTs, but a broken row just kept failing checkout.
// This clears the credentials so the provider can reconnect cleanly (the callback's
// ON CONFLICT then overwrites with a fresh, currently-encryptable token).
//
// We DEACTIVATE rather than delete the row: NULL the access/refresh tokens (so no unusable
// secret lingers and checkout's "not connected" branch fires cleanly) and flip status to
// 'disconnected'. Idempotent — disconnecting an absent/already-clear account still 200s.
// Tokens are NEVER read or returned here.
async function DELETE(request, { params }) {
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
    // owner|admin only — same authority as connecting.
    await requireProviderRole(providerId, userId);

    await sql`
      UPDATE provider_payment_accounts
      SET access_token = NULL,
          refresh_token = NULL,
          status = 'disconnected',
          updated_at = now()
      WHERE provider_id = ${providerId} AND rail = 'mercadopago'
    `;

    return Response.json({ disconnected: true, rail: "mercadopago" });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "[DELETE .../mercadopago] Error:",
      error.message,
    );
    return Response.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}

const wrappedDELETE = withRequestContext(DELETE);
export { wrappedDELETE as DELETE };
