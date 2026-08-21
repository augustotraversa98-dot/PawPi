import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { withRateLimit } from "@/app/api/utils/rateLimit";
import { createCheckout } from "@/app/api/utils/payments";
import { bizNotifyBody } from "@/app/api/utils/notify";
import { notifyProviderTeam } from "@/app/api/utils/providerNotify";
import {
  SUPPORTED_RAILS,
  PaymentsNotConfiguredError,
  ProviderPaymentAccountError,
} from "@/app/api/utils/payments/config";
import { paymentAttempt } from "@/lib/metrics";

// POST /api/payments/checkout — the OWNER starts a payment (ticket 2.3). Creates an
// `orders` row for a (kind, provider, amount) plus, via the provider-agnostic payment
// layer, the rail checkout + a pending `payments` ledger row. Returns the checkout URL/
// deeplink the owner is sent to.
//
// OWNER-context: authorization is the payer's identity (owner_user_id = me), not provider
// membership. The order is created under the caller's RLS identity (orders_owner_write).
// Rail is chosen by the client from SUPPORTED_RAILS — never hardcoded. A missing key for
// the chosen rail surfaces as a clean 503 ("payments not configured"), never a crash.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").

const ALLOWED_KINDS = [
  "booking",
  "product",
  "adoption_fee",
  "donation",
  "subscription",
];

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = (await request.json()) ?? {};
    const {
      provider_id,
      kind,
      amount_cents,
      currency,
      rail,
      source_ref,
      items,
      idempotency_key,
    } = body;

    if (!provider_id) {
      return Response.json({ error: "provider_id is required" }, { status: 400 });
    }
    if (!ALLOWED_KINDS.includes(kind)) {
      return Response.json({ error: `Invalid kind: ${kind}` }, { status: 400 });
    }
    if (!Number.isInteger(amount_cents) || amount_cents < 0) {
      return Response.json(
        { error: "amount_cents must be a non-negative integer" },
        { status: 400 },
      );
    }
    if (!SUPPORTED_RAILS.includes(rail)) {
      return Response.json({ error: `Invalid rail: ${rail}` }, { status: 400 });
    }

    // 1. Create the order as the paying owner (RLS WITH CHECK requires owner_user_id = me).
    const orderRows = await sql`
      INSERT INTO orders
        (owner_user_id, provider_id, kind, source_ref, amount_cents, currency, status)
      VALUES (
        ${userId}, ${provider_id}, ${kind}, ${source_ref ?? null},
        ${amount_cents}, ${currency ?? "ARS"}, 'pending'
      )
      RETURNING *
    `;
    const order = orderRows[0];

    // 1b. Optional line items (shop). Each line is owner-scoped via the order.
    if (Array.isArray(items)) {
      for (const it of items) {
        await sql`
          INSERT INTO order_items (order_id, name, quantity, unit_cents, product_ref)
          VALUES (
            ${order.id}, ${it.name ?? "item"}, ${it.quantity ?? 1},
            ${it.unit_cents ?? 0}, ${it.product_ref ?? null}
          )
        `;
      }
    }

    // 2. Create the rail checkout + pending payment via the provider-agnostic layer.
    const idempotencyKey = idempotency_key || `order-${order.id}`;
    const result = await createCheckout(order, { rail, idempotencyKey });

    try { paymentAttempt.add(1, { rail }); } catch {}

    // PROVIDER NOTIFICATION (BN2 biz_order) — a new PRODUCT order. Only 'product' (a booking
    // payment already fired biz_booking at the book route; adoption/donation/subscription are
    // not "orders" a provider stocks). actor = the payer so the provider team is notified.
    if (kind === "product") {
      await notifyProviderTeam({
        providerId: provider_id,
        actor: userId,
        type: "biz_order",
        subjectRef: order.id,
        body: bizNotifyBody({
          kind: "order",
          amount_cents: order.amount_cents,
          currency: order.currency,
        }),
      });
    }

    return Response.json(
      {
        order,
        payment: result.payment,
        checkoutUrl: result.checkoutUrl,
        deeplink: result.deeplink ?? null,
        qrContent: result.qrContent ?? null,
      },
      { status: 201 },
    );
  } catch (error) {
    // Provider hasn't connected / their token is unusable — DISTINCT from the platform 503.
    if (error instanceof ProviderPaymentAccountError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    if (error instanceof PaymentsNotConfiguredError || error.status === 503) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    if (error.status === 400) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("[POST /api/payments/checkout] Error:", error.message);
    return Response.json({ error: "Failed to create checkout" }, { status: 500 });
  }
}

// #6: rate limit — caps payment-attempt abuse (mirrors booking_create).
const wrappedPOST = withRequestContext(withRateLimit("checkout_create", POST));
export { wrappedPOST as POST };
