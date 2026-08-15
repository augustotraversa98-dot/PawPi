import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { createCheckout } from "@/app/api/utils/payments";
import { bizNotifyBody } from "@/app/api/utils/notify";
import { notifyProviderTeam } from "@/app/api/utils/providerNotify";
import {
  SUPPORTED_RAILS,
  PaymentsNotConfiguredError,
  ProviderPaymentAccountError,
} from "@/app/api/utils/payments/config";

// POST /api/pets/[id]/shop-checkout — the OWNER turns a CART into a paid 'product' order.
// Phase 2 ticket 2.11 (docs/phase2-tickets/2.11-shop-ecommerce.md).
//
// This is an OWNER-context route (authorization = pet OWNERSHIP). It REUSES the 2.3 money
// layer: it builds an orders row (kind='product') + order_items, then calls the SAME
// provider-agnostic createCheckout the generic /api/payments/checkout uses (split → provider
// payout). It does NOT duplicate the order/payment tables.
//
// Three guards BEFORE the order is created (DO-NOT: never sell out-of-stock; never bypass the
// Rx check; never bypass the capability gate):
//   1. the shop provider must HOLD the 'shop' capability (the module gate, 2.1).
//   2. every line's product must be ACTIVE, in the SAME shop, and have stock_qty >= qty
//      (out-of-stock → clean 409). The unit price is taken from the catalog (server-trusted),
//      never the client.
//   3. an is_rx product requires a valid vet RELATIONSHIP for THIS pet — the Rx gate. We
//      mirror the consent model via app_pet_has_vet_relationship(pet_id) (0037): an active
//      care grant to a vet-capable provider OR a recorded vet note. No relationship → 403.
//
// STOCK is decremented on PAID (and restocked on refund) by the 2.3 payment layer's
// app_adjust_order_stock hook — NOT here (the order is only 'pending' at checkout time).
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").
async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const petId = params.id;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // I must OWN the pet (the Rx gate keys off this pet; the order is mine).
    const petCheck = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (petCheck.length === 0) {
      return Response.json(
        { error: "Pet not found or access denied" },
        { status: 403 },
      );
    }

    const body = (await request.json()) ?? {};
    const {
      provider_id,
      items,
      rail,
      idempotency_key,
      fulfillment_type,
      shipping_address,
    } = body;

    if (!provider_id) {
      return Response.json({ error: "provider_id is required" }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return Response.json({ error: "items is required" }, { status: 400 });
    }
    if (!SUPPORTED_RAILS.includes(rail)) {
      return Response.json({ error: `Invalid rail: ${rail}` }, { status: 400 });
    }

    // FULFILLMENT (Services Hub P4b) — pickup or delivery-address. Back-compat: an omitted
    // field is 'pickup' (matching the column default), so every pre-P4b caller still works.
    // Delivery REQUIRES an address; pickup stores none. No courier/fee/tracking this phase.
    const fulfillmentType = fulfillment_type ?? "pickup";
    if (!["pickup", "delivery"].includes(fulfillmentType)) {
      return Response.json(
        { error: `Invalid fulfillment_type: ${fulfillmentType}` },
        { status: 400 },
      );
    }
    let shippingAddress = null;
    if (fulfillmentType === "delivery") {
      const addr =
        shipping_address && typeof shipping_address === "object"
          ? shipping_address.address
          : null;
      if (typeof addr !== "string" || addr.trim().length === 0) {
        return Response.json(
          { error: "A delivery address is required for delivery orders" },
          { status: 400 },
        );
      }
      shippingAddress = shipping_address;
    }

    // GATE 1 — the provider must hold the 'shop' capability (2.1).
    const capRows = await sql`
      SELECT 1 FROM provider_capabilities
      WHERE provider_id = ${provider_id} AND capability = 'shop'
    `;
    if (capRows.length === 0) {
      return Response.json(
        { error: "Provider does not offer a shop" },
        { status: 400 },
      );
    }

    // Resolve + validate every cart line against the catalog. Build the priced lines.
    const lines = [];
    let amountCents = 0;
    let needsRx = false;
    for (const it of items) {
      const productId = it.product_id;
      const qty =
        Number.isInteger(it.quantity) && it.quantity > 0 ? it.quantity : 1;
      if (!productId) {
        return Response.json(
          { error: "each item needs a product_id" },
          { status: 400 },
        );
      }

      // The product must be ACTIVE and belong to THIS shop. RLS lets an authed owner read a
      // published shop's active products (0037).
      const prodRows = await sql`
        SELECT id, name, price_cents, stock_qty, is_rx, active, provider_id
        FROM shop_products
        WHERE id = ${productId} AND provider_id = ${provider_id} AND active = true
      `;
      if (prodRows.length === 0) {
        return Response.json(
          { error: "Product not available" },
          { status: 404 },
        );
      }
      const product = prodRows[0];

      // GATE 2 — never sell out-of-stock.
      if (product.stock_qty < qty) {
        return Response.json(
          { error: `Out of stock: ${product.name}` },
          { status: 409 },
        );
      }

      if (product.is_rx) needsRx = true;

      lines.push({
        product_id: product.id,
        name: product.name,
        quantity: qty,
        unit_cents: product.price_cents,
      });
      amountCents += product.price_cents * qty;
    }

    // GATE 3 — the Rx gate. If ANY line is a prescription product, this pet must have a valid
    // vet relationship (mirrors the consent model — documented in 0037).
    if (needsRx) {
      const rxRows = await sql`
        SELECT app_pet_has_vet_relationship(${petId}) AS ok
      `;
      if (!rxRows?.[0]?.ok) {
        return Response.json(
          {
            error:
              "This item requires a prescription. Connect your pet's vet (or add a vet note) before purchasing.",
          },
          { status: 403 },
        );
      }
    }

    // Create the 'product' order as the paying owner (RLS WITH CHECK: owner_user_id = me).
    // fulfillment_type + shipping_address are additive (0073): a pickup order stores
    // 'pickup' + null exactly as a pre-P4b order did.
    const orderRows = await sql`
      INSERT INTO orders
        (owner_user_id, provider_id, kind, amount_cents, currency, status,
         fulfillment_type, shipping_address)
      VALUES (
        ${userId}, ${provider_id}, 'product', ${amountCents}, 'ARS', 'pending',
        ${fulfillmentType},
        ${shippingAddress != null ? sql.json(shippingAddress) : null}
      )
      RETURNING *
    `;
    const order = orderRows[0];

    // Persist the priced line items (product_id ties each to its catalog row for stock).
    for (const line of lines) {
      await sql`
        INSERT INTO order_items (order_id, name, quantity, unit_cents, product_id)
        VALUES (${order.id}, ${line.name}, ${line.quantity}, ${line.unit_cents}, ${line.product_id})
      `;
    }

    // Hand off to the 2.3 payment layer — same createCheckout the generic checkout uses.
    const idempotencyKey = idempotency_key || `order-${order.id}`;
    const result = await createCheckout(order, { rail, idempotencyKey });

    // PROVIDER NOTIFICATION (BN2 biz_order) — a new product order for this store. actor =
    // the paying owner so the provider team is notified.
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
    console.error("[POST /api/pets/[id]/shop-checkout] Error:", error?.message);
    return Response.json({ error: "Failed to check out" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
