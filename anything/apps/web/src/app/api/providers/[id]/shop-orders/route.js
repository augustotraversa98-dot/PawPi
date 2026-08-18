import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderRole,
  requireProviderCapability,
  ProviderAuthError,
  ALL_PROVIDER_ROLES,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/providers/[id]/shop-orders — the SHOP dashboard's order queue. Phase 2 ticket
// 2.11. Lists the provider's 'product' orders (with their line items) for fulfillment.
//
// Gated by requireProviderCapability(providerId,'shop') + requireProviderRole (active staff
// run fulfillment, not just admins). orders RLS (0029) scopes per-row: P's active staff see
// P's orders, never another provider's. order_items ride the parent-order visibility.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderCapability(providerId, "shop");
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    // The shop's product orders, newest first. RLS scopes to this provider's staff.
    const orders = await sql`
      SELECT
        id, owner_user_id, provider_id, kind, amount_cents, currency, status,
        fulfillment_status, created_at, updated_at
      FROM orders
      WHERE provider_id = ${providerId} AND kind = 'product'
      ORDER BY created_at DESC, id DESC
    `;

    // Attach line items per order (parent-order visibility via RLS). Batched in one
    // query (same fix as api/shop/orders/route.js) instead of one round-trip per order.
    const orderIds = orders.map((o) => o.id);
    const allItems =
      orderIds.length > 0
        ? await sql`
            SELECT id, order_id, name, quantity, unit_cents, product_id
            FROM order_items
            WHERE order_id = ANY(${orderIds})
            ORDER BY order_id, id
          `
        : [];

    const itemsByOrderId = new Map();
    for (const item of allItems) {
      if (!itemsByOrderId.has(item.order_id)) itemsByOrderId.set(item.order_id, []);
      itemsByOrderId.get(item.order_id).push(item);
    }

    const enriched = orders.map((order) => ({
      ...order,
      items: itemsByOrderId.get(order.id) ?? [],
    }));

    return Response.json({ orders: enriched });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[GET /api/providers/[id]/shop-orders] Error:", e?.message);
    return Response.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
