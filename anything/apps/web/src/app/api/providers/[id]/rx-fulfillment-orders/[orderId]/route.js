import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// PATCH /api/providers/[id]/rx-fulfillment-orders/[orderId] — the dispensing provider acts on a
// fulfillment (Wave 7 ticket 2.71): set price, accept, advance status, cancel. Capability-gated to
// `pharmacy`; RLS (rx_fulfillment_staff_update) is the real guard — a non-staff caller updates ZERO.
//
// The terminal 'fulfilled' transition NEVER goes through a plain UPDATE (the staff WITH CHECK forbids
// it): it runs through the fulfill_rx_order() DEFINER, which consumes a refill on the 2.53 safe path
// (greatest(refills_remaining-1,0)) so the append-only Rx is never written directly.
//
// DB is porsager's tagged-template `sql`.
const ADVANCE_STATUSES = [
  "requested",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
  "cancelled",
];

async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const providerId = params.id;
    const orderId = params.orderId;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    await requireProviderCapability(providerId, "pharmacy");

    const body = (await request.json()) ?? {};
    const { status, price_cents } = body;

    if (
      price_cents !== undefined &&
      price_cents !== null &&
      !(Number.isInteger(price_cents) && price_cents >= 0)
    ) {
      return Response.json(
        { error: "price_cents must be a non-negative integer" },
        { status: 400 },
      );
    }

    // 'fulfilled' → the DEFINER safe path (consumes a refill). Active-staff is checked inside it.
    if (status === "fulfilled") {
      // Allow a price to be set in the same action before fulfilling.
      if (price_cents !== undefined && price_cents !== null) {
        await sql`
          UPDATE rx_fulfillment_orders
          SET price_cents = ${price_cents}, updated_at = now()
          WHERE id = ${orderId} AND provider_id = ${providerId}
        `;
      }
      const res = await sql`SELECT fulfill_rx_order(${orderId}) AS result`;
      const result = res[0]?.result;
      if (result === "fulfilled") {
        const row = await sql`
          SELECT * FROM rx_fulfillment_orders WHERE id = ${orderId} AND provider_id = ${providerId}
        `;
        return Response.json({ order: row[0], result });
      }
      const code =
        result === "forbidden" ? 403 : result === "not_found" ? 404 : 409;
      return Response.json({ error: result }, { status: code });
    }

    if (status !== undefined && !ADVANCE_STATUSES.includes(status)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }

    // accept / price / advance / cancel — RLS staff_update scopes the row + forbids 'fulfilled'.
    const updated = await sql`
      UPDATE rx_fulfillment_orders
      SET
        status = COALESCE(${status ?? null}, status),
        price_cents = COALESCE(${price_cents ?? null}, price_cents),
        updated_at = now()
      WHERE id = ${orderId} AND provider_id = ${providerId}
      RETURNING *
    `;
    if (updated.length === 0) {
      return Response.json(
        { error: "Fulfillment not found or not authorized" },
        { status: 404 },
      );
    }
    return Response.json({ order: updated[0] });
  } catch (e) {
    if (e instanceof ProviderAuthError || e.status === 403) {
      return Response.json({ error: e.message }, { status: 403 });
    }
    console.error(
      "[PATCH /api/providers/[id]/rx-fulfillment-orders/[orderId]] Error:",
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
