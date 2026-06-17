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

// PATCH /api/providers/[id]/shop-orders/[orderId] — the SHOP advances an order's FULFILLMENT
// (shipped/delivered/cancelled). Phase 2 ticket 2.11.
//
// Gated by requireProviderCapability(providerId,'shop') + requireProviderRole. The actual
// write goes through the SECURITY DEFINER app_set_order_fulfillment helper (0037): it updates
// ONLY orders.fulfillment_status — the 2.3 payment-status machine (orders.status) stays
// owner-write-only. The helper authorizes the caller as active staff of the order's provider
// and returns NULL when not authorized / not a product order → we map that to 404.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").
const ALLOWED_FULFILLMENT = [
  "placed",
  "paid",
  "shipped",
  "delivered",
  "cancelled",
];

async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: providerId, orderId } = params;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderCapability(providerId, "shop");
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    const body = (await request.json()) ?? {};
    const { fulfillment_status } = body;
    if (!ALLOWED_FULFILLMENT.includes(fulfillment_status)) {
      return Response.json(
        {
          error: `fulfillment_status must be one of ${ALLOWED_FULFILLMENT.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Confirm the order belongs to THIS provider (defence-in-depth; the helper also checks
    // staff membership of the order's provider).
    const orderRows = await sql`
      SELECT id FROM orders
      WHERE id = ${orderId} AND provider_id = ${providerId} AND kind = 'product'
    `;
    if (orderRows.length === 0) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    const result = await sql`
      SELECT app_set_order_fulfillment(${orderId}, ${fulfillment_status}) AS status
    `;
    if (!result?.[0]?.status) {
      return Response.json(
        { error: "Not authorized to fulfill this order" },
        { status: 403 },
      );
    }

    return Response.json({ fulfillment_status: result[0].status });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[PATCH /api/providers/[id]/shop-orders/[orderId]] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to update fulfillment" },
      { status: 500 },
    );
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
