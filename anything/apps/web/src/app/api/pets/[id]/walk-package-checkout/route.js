import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { createCheckout } from "@/app/api/utils/payments";
import {
  SUPPORTED_RAILS,
  PaymentsNotConfiguredError,
  ProviderPaymentAccountError,
} from "@/app/api/utils/payments/config";

// POST /api/pets/[id]/walk-package-checkout — the OWNER buys a prepaid WALK PACKAGE (Ticket B2).
// Mirrors pets/[id]/shop-checkout: it REUSES the 2.3 money layer (an orders row + the SAME
// createCheckout) and does NOT duplicate the order/payment tables. The credit balance is GRANTED on
// PAID (applyPaymentStatus → app_grant_walk_credits), NEVER at checkout creation.
//
// Guards BEFORE the order is created:
//   1. the caller OWNS the pet (owner context — the credits are theirs, per owner↔provider).
//   2. the provider HOLDS the 'walker' capability (the module gate).
//   3. the package must be ACTIVE and belong to THIS provider; its PRICE is read from the catalog
//      (server-trusted, never the client).
//
// The package id rides in orders.source_ref as 'walk_package:<id>' so the paid-webhook grant knows
// which pack to mint. Degrade clean: if walk_packages is absent (unmigrated), the package lookup
// finds nothing → clean 404, never a 500.
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

    // GATE 1 — I must OWN the pet (owner context).
    const petCheck = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (petCheck.length === 0) {
      return Response.json({ error: "Pet not found or access denied" }, { status: 403 });
    }

    const body = (await request.json()) ?? {};
    const { provider_id, walk_package_id, rail, idempotency_key } = body;

    if (!provider_id) {
      return Response.json({ error: "provider_id is required" }, { status: 400 });
    }
    if (!walk_package_id) {
      return Response.json({ error: "walk_package_id is required" }, { status: 400 });
    }
    if (!SUPPORTED_RAILS.includes(rail)) {
      return Response.json({ error: `Invalid rail: ${rail}` }, { status: 400 });
    }

    // GATE 2 — the provider must hold the 'walker' capability.
    const capRows = await sql`
      SELECT 1 FROM provider_capabilities
      WHERE provider_id = ${provider_id} AND capability = 'walker'
    `;
    if (capRows.length === 0) {
      return Response.json({ error: "Provider does not offer walks" }, { status: 400 });
    }

    // GATE 3 — the package must be ACTIVE + this provider's. Price is server-trusted. Degrade clean:
    // an absent walk_packages table → treat as "no such package" (404), never a 500.
    let pkgRows;
    try {
      pkgRows = await sql`
        SELECT id, walks_count, price_cents, currency
        FROM walk_packages
        WHERE id = ${walk_package_id} AND provider_id = ${provider_id} AND active = true
      `;
    } catch (e) {
      if (e?.code === "42P01" || /relation .* does not exist/i.test(e?.message ?? "")) {
        return Response.json({ error: "Walk package not available" }, { status: 404 });
      }
      throw e;
    }
    if (pkgRows.length === 0) {
      return Response.json({ error: "Walk package not available" }, { status: 404 });
    }
    const pkg = pkgRows[0];

    // Create the 'walk_package' order as the paying owner (RLS WITH CHECK: owner_user_id = me). The
    // package id rides in source_ref so the paid-webhook grant knows which pack to mint.
    const orderRows = await sql`
      INSERT INTO orders
        (owner_user_id, provider_id, kind, source_ref, amount_cents, currency, status)
      VALUES (
        ${userId}, ${provider_id}, 'walk_package', ${`walk_package:${pkg.id}`},
        ${pkg.price_cents}, ${pkg.currency ?? "ARS"}, 'pending'
      )
      RETURNING *
    `;
    const order = orderRows[0];

    // Hand off to the 2.3 payment layer — same createCheckout the shop uses.
    const idempotencyKey = idempotency_key || `order-${order.id}`;
    const result = await createCheckout(order, { rail, idempotencyKey });

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
    console.error("[POST /api/pets/[id]/walk-package-checkout] Error:", error?.message);
    return Response.json({ error: "Failed to check out" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
