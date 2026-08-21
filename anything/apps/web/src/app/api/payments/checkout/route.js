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

// B1 — FAIL-CLOSED SERVER-SIDE PRICING (night-run #1). This route is the shared payment entry point
// and previously charged the client-supplied amount_cents verbatim — a user could pay 1 cent for
// anything. The rule now: the client amount is NEVER charged as-is except for a bounded donation;
// every priceable kind derives its amount on the server, and any kind without a server price source
// is rejected. See docs/night-run/2026-08-21/SECURITY_FIXES.md #1.

// A donation is legitimately donor-chosen; bound it so it can't be zero/negative or absurd. Tune
// before launch if needed (this is a sanity cap, not a product limit).
const DONATION_MAX_CENTS = 5_000_000;

// Kinds with no server-verified price contract yet. Fail closed until each is wired to its price
// source (per-flow spec in SECURITY_FIXES.md #1): booking → provider_services, adoption_fee →
// adoptable_listings, subscription → the plan/product it renews.
const PRICING_NOT_CONFIGURED_KINDS = new Set([
  "booking",
  "adoption_fee",
  "subscription",
]);

// Derive the authoritative amount for a `product` checkout on the server. Two shapes:
//   - shop-catalog: `items[]` each name a real shop_products row (active, same provider) — sum
//     price_cents × qty from the CATALOG (mirrors pets/[id]/shop-checkout). product_id ties each
//     line to its catalog row for the paid-stock hook (the old code wrote product_ref — a column
//     the hook doesn't read; fixed here).
//   - rx-fulfillment: no items, `source_ref = "rxf-<id>"` — price comes from the owner's
//     rx_fulfillment_orders row.
// Returns { amountCents, lines } on success, or { error, code, status } to return verbatim. Never
// falls back to the client amount — an unpriceable product is rejected (fail closed).
async function priceProduct({ items, source_ref, provider_id, userId }) {
  if (Array.isArray(items) && items.length > 0) {
    let amountCents = 0;
    const lines = [];
    for (const it of items) {
      const productId = it?.product_id ?? it?.product_ref;
      const qty =
        Number.isInteger(it?.quantity) && it.quantity > 0 ? it.quantity : 1;
      if (productId == null) {
        return { error: "Each item needs a product_id", code: "unpriceable_item", status: 400 };
      }
      const prodRows = await sql`
        SELECT id, name, price_cents, active, provider_id
        FROM shop_products
        WHERE id = ${productId} AND provider_id = ${provider_id} AND active = true
      `;
      if (prodRows.length === 0 || prodRows[0].price_cents == null) {
        return { error: "Product not available", code: "unpriceable_item", status: 404 };
      }
      const product = prodRows[0];
      lines.push({
        product_id: product.id,
        name: product.name,
        quantity: qty,
        unit_cents: product.price_cents,
      });
      amountCents += product.price_cents * qty;
    }
    return { amountCents, lines };
  }

  // rx-fulfillment: source_ref like "rxf-<id>" → the owner's fulfillment order carries the price.
  const rxf = typeof source_ref === "string" ? source_ref.match(/^rxf-(\d+)$/) : null;
  if (rxf) {
    const rows = await sql`
      SELECT price_cents
      FROM rx_fulfillment_orders
      WHERE id = ${parseInt(rxf[1], 10)} AND owner_user_id = ${userId}
    `;
    if (rows.length === 0 || rows[0].price_cents == null) {
      return {
        error: "Prescription order not found or not priced",
        code: "unpriceable_product",
        status: 404,
      };
    }
    return { amountCents: rows[0].price_cents, lines: [] };
  }

  // No line items and no recognized priced reference → we cannot price it. Fail closed.
  return {
    error: "Checkout for 'product' requires resolvable line items or a priced order reference",
    code: "pricing_not_configured",
    status: 400,
  };
}

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
    if (!SUPPORTED_RAILS.includes(rail)) {
      return Response.json({ error: `Invalid rail: ${rail}` }, { status: 400 });
    }

    // B1 FAIL-CLOSED PRICING — derive/verify the amount on the server. The client's amount_cents is
    // ignored for every kind except a bounded donation.
    let amountToCharge;
    let lines = [];
    if (kind === "product") {
      const priced = await priceProduct({ items, source_ref, provider_id, userId });
      if (priced.error) {
        return Response.json(
          { error: priced.error, code: priced.code },
          { status: priced.status },
        );
      }
      amountToCharge = priced.amountCents;
      lines = priced.lines;
    } else if (kind === "donation") {
      // Donor-chosen, but bounded: positive integer up to the sanity cap.
      if (
        !Number.isInteger(amount_cents) ||
        amount_cents <= 0 ||
        amount_cents > DONATION_MAX_CENTS
      ) {
        return Response.json(
          {
            error: `donation amount must be a positive integer up to ${DONATION_MAX_CENTS} cents`,
            code: "invalid_amount",
          },
          { status: 400 },
        );
      }
      amountToCharge = amount_cents;
    } else if (PRICING_NOT_CONFIGURED_KINDS.has(kind)) {
      // No server-verified price source yet → never charge a client amount. Fail closed.
      return Response.json(
        {
          error: `Checkout for '${kind}' is not enabled until server-side pricing is configured`,
          code: "pricing_not_configured",
        },
        { status: 400 },
      );
    } else {
      // Defensive: an ALLOWED_KIND with no pricing branch — reject rather than trust the client.
      return Response.json(
        { error: `Checkout for '${kind}' is not enabled`, code: "pricing_not_configured" },
        { status: 400 },
      );
    }

    // 1. Create the order as the paying owner (RLS WITH CHECK requires owner_user_id = me). The
    //    amount is the SERVER value, never the client's.
    const orderRows = await sql`
      INSERT INTO orders
        (owner_user_id, provider_id, kind, source_ref, amount_cents, currency, status)
      VALUES (
        ${userId}, ${provider_id}, ${kind}, ${source_ref ?? null},
        ${amountToCharge}, ${currency ?? "ARS"}, 'pending'
      )
      RETURNING *
    `;
    const order = orderRows[0];

    // 1b. Priced line items (product shop-catalog path only). unit_cents + product_id come from the
    //     catalog (server-trusted); product_id ties each line to its catalog row for the stock hook.
    for (const line of lines) {
      await sql`
        INSERT INTO order_items (order_id, name, quantity, unit_cents, product_id)
        VALUES (${order.id}, ${line.name}, ${line.quantity}, ${line.unit_cents}, ${line.product_id})
      `;
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
