import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/shop/orders — the OWNER's product ORDER HISTORY. Phase 2 ticket 2.11.
//
// REUSES the 2.3 orders/order_items tables (0029) — lists the owner's kind='product' orders
// with their line items + payment/fulfillment status. OWNER-context: orders RLS (0029) scopes
// to owner_user_id = me. Empty → empty array (the UI shows an empty state — no fake orders).
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const orders = await sql`
      SELECT
        o.id, o.owner_user_id, o.provider_id, o.kind, o.amount_cents, o.currency,
        o.status, o.fulfillment_status, o.fulfillment_type, o.shipping_address,
        o.created_at, o.updated_at,
        p.name AS provider_name
      FROM orders o
      LEFT JOIN providers p ON p.id = o.provider_id
      WHERE o.owner_user_id = ${userId} AND o.kind = 'product'
      ORDER BY o.created_at DESC, o.id DESC
    `;

    const enriched = [];
    for (const order of orders) {
      const items = await sql`
        SELECT id, order_id, name, quantity, unit_cents, product_id
        FROM order_items
        WHERE order_id = ${order.id}
        ORDER BY id
      `;
      enriched.push({ ...order, items });
    }

    return Response.json({ orders: enriched });
  } catch (error) {
    console.error("[GET /api/shop/orders] Error:", error?.message);
    return Response.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
