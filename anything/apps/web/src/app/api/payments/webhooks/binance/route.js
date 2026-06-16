import { handleWebhook } from "@/app/api/utils/payments";
import { PaymentsNotConfiguredError } from "@/app/api/utils/payments/config";

// POST /api/payments/webhooks/binance — the Binance Pay webhook (ticket 2.3).
//
// Called by Binance Pay, not a logged-in user → NO auth wrapper. Security is the
// SIGNATURE: handleWebhook verifies the BinancePay-Signature HMAC over the raw body
// before trusting any field, then flips the payment + order status. Unverified → 401,
// no state change. Unknown reference → 200 ack. Missing key → 503, never a crash.
async function POST(request) {
  try {
    const rawBody = await request.text();
    let body = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      body = {};
    }
    // Binance nests the business payload as a JSON string in `data`; surface it for the
    // layer's ref extraction while keeping rawBody for signature verification.
    if (typeof body.data === "string") {
      try {
        body = { ...body, ...JSON.parse(body.data) };
      } catch {
        /* leave body as-is */
      }
    }
    const headers = Object.fromEntries(request.headers.entries());

    const result = await handleWebhook("binance", { headers, rawBody, body });

    if (!result.ok) {
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
    console.error("[POST /api/payments/webhooks/binance] Error:", error.message);
    return Response.json({ error: "Webhook handling failed" }, { status: 500 });
  }
}

export { POST };
