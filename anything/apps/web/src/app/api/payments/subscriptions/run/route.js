import sql from "@/app/api/utils/sql";
import {
  withTransaction,
  setCurrentUserId,
} from "@/app/api/utils/requestContext";
import { createCheckout } from "@/app/api/utils/payments";
import { PaymentsNotConfiguredError } from "@/app/api/utils/payments/config";
import { nextChargeAt } from "@/app/api/utils/payments/subscriptionCadence";

// POST /api/payments/subscriptions/run — the SHOP AUTO-REORDER charger (Phase 2 ticket 2.17).
//
// MACHINE-TO-MACHINE (not user-authed): an external scheduler (host cron / CI cron) POSTs
// here on a daily cadence with the shared secret header. It re-buys each DUE shop
// subscription through the SAME payment layer as a normal shop order, then advances
// next_charge_at by the plan cadence. Safe to run repeatedly (period-stable idempotency key);
// degrades cleanly when payments aren't configured (each charge simply skips).
//
// RLS: the due-scan crosses owners, so it enumerates via the SECURITY DEFINER
// app_due_subscriptions() (0039) — the route NEVER reads `subscriptions` directly across
// owners. Each charge then runs in its OWN transaction under setCurrentUserId(owner) so the
// order/order_items INSERTs satisfy the owner FOR-ALL RLS. The DB connects as pawpi_app
// (NOBYPASSRLS), every table FORCE-RLS.
async function POST(request) {
  const secret = process.env.CRON_SECRET;
  // Never run open: with no configured secret this endpoint is disabled.
  if (!secret) {
    return Response.json({ error: "scheduler not configured" }, { status: 503 });
  }
  if (request.headers.get("x-cron-secret") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Cross-owner DEFINER enumeration of the due set (also surfaces the provider's connected
  // rail, which the owner-scoped charge below could not read from admin-only RLS).
  const due = await sql`SELECT * FROM app_due_subscriptions()`;

  let charged = 0;
  const skipped = [];
  const failed = [];

  for (const sub of due) {
    // No connected rail → the provider hasn't set up payments. Skip (leave next_charge_at so
    // it retries on the next run); not an error.
    if (!sub.connected_rail) {
      skipped.push({ subId: sub.id, reason: "provider not connected" });
      continue;
    }

    try {
      // Each sub gets its OWN transaction + owner identity + try/catch, so one bad sub never
      // aborts the run or another sub's write.
      const outcome = await withTransaction(async () => {
        await setCurrentUserId(sub.owner_user_id);

        // Re-validate the product UNDER THE OWNER'S identity (RLS lets an authed owner read a
        // published shop's active product). Price is read server-side — never a stored amount.
        const prodRows = await sql`
          SELECT id, name, price_cents, stock_qty, is_rx, active
          FROM shop_products
          WHERE id = ${sub.product_id} AND active = true
        `;
        const product = prodRows[0];
        if (!product) return { skip: "product unavailable" };
        // Rx products NEVER auto-reorder (the 2.11 rule — the Rx gate must run per purchase).
        if (product.is_rx) return { skip: "rx product not auto-reordered" };
        if (product.stock_qty < sub.quantity) return { skip: "insufficient stock" };

        const amountCents = product.price_cents * sub.quantity;

        // Build the recurring order EXACTLY like shop-checkout (kind='product' so it reuses
        // the 2.3 stock-decrement + payment path). source_ref ties it to the subscription.
        const orderRows = await sql`
          INSERT INTO orders
            (owner_user_id, provider_id, kind, source_ref, amount_cents, currency, status)
          VALUES (
            ${sub.owner_user_id}, ${sub.provider_id}, 'product',
            ${`subscription:${sub.id}`}, ${amountCents}, 'ARS', 'pending'
          )
          RETURNING *
        `;
        const order = orderRows[0];
        await sql`
          INSERT INTO order_items (order_id, name, quantity, unit_cents, product_id)
          VALUES (${order.id}, ${product.name}, ${sub.quantity}, ${product.price_cents}, ${product.id})
        `;

        // Period-stable idempotency key: a double-run inside the same charge window is a
        // no-op via the payments ON CONFLICT(idempotency_key) — we never double-charge.
        const periodBoundary = new Date(sub.next_charge_at)
          .toISOString()
          .slice(0, 10);
        await createCheckout(order, {
          rail: sub.connected_rail,
          idempotencyKey: `sub-${sub.id}-${periodBoundary}`,
        });

        // Advance next_charge_at ONLY after a successful checkout creation.
        const next = nextChargeAt(sub.next_charge_at, sub.plan);
        await sql`
          UPDATE subscriptions
          SET next_charge_at = ${next}, updated_at = now()
          WHERE id = ${sub.id}
        `;
        return { charged: true };
      });

      if (outcome?.charged) charged += 1;
      else if (outcome?.skip) skipped.push({ subId: sub.id, reason: outcome.skip });
    } catch (error) {
      // Payments unconfigured (or any rail-config 503) → skip cleanly; DO NOT advance.
      if (error instanceof PaymentsNotConfiguredError || error.status === 503) {
        skipped.push({ subId: sub.id, reason: "payments not configured" });
      } else {
        // Any other per-sub error is DATA, not a 500 — record and keep going.
        failed.push({ subId: sub.id, reason: error?.message ?? "error" });
      }
    }
  }

  // Always 200 on a completed run; per-sub failures are reported in the body.
  return Response.json({ processed: due.length, charged, skipped, failed });
}

export { POST };
