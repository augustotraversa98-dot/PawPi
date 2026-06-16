import { handleWebhook } from "@/app/api/utils/payments";
import { PaymentsNotConfiguredError } from "@/app/api/utils/payments/config";

// POST /api/payments/webhooks/mercadopago — the MercadoPago payment webhook (ticket 2.3).
//
// This endpoint is called by MercadoPago, NOT by a logged-in user, so there is NO
// auth()/identity wrapper. Security is the SIGNATURE: handleWebhook verifies the
// x-signature HMAC before trusting ANY field, and only then flips the payment + order
// status (status reconciliation). An unverified payload returns 401 and changes nothing.
// An unknown reference is acknowledged (200) so the rail stops retrying.
//
// A missing MP webhook secret surfaces as PaymentsNotConfiguredError → 503 (never a
// crash). We read the RAW body for signature verification and parse it ourselves.
async function POST(request) {
  try {
    const rawBody = await request.text();
    let body = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      body = {};
    }
    const headers = Object.fromEntries(request.headers.entries());

    const result = await handleWebhook("mercadopago", { headers, rawBody, body });

    if (!result.ok) {
      // invalid_signature → 401; never reveal more than necessary.
      return Response.json(
        { error: result.reason ?? "rejected" },
        { status: result.status === 401 ? 401 : 400 },
      );
    }
    return Response.json({ ok: true, status: result.status });
  } catch (error) {
    if (error instanceof PaymentsNotConfiguredError || error.status === 503) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    console.error("[POST /api/payments/webhooks/mercadopago] Error:", error.message);
    return Response.json({ error: "Webhook handling failed" }, { status: 500 });
  }
}

export { POST };
