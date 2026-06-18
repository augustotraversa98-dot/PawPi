import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// PATCH /api/rx-fulfillment-orders/[id] — the OWNER cancels a still-'requested' fulfillment, or
// links the 2.3 order they just paid (sets order_id). RLS owner_update pins the owner to
// requested|cancelled, so they can never set a provider-only status or 'fulfilled'. A non-owner
// updates ZERO rows → 404.
//
// DB is porsager's tagged-template `sql`.
async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const id = params.id;
    const body = (await request.json()) ?? {};
    const { status, order_id } = body;

    if (status !== undefined && status !== "cancelled") {
      return Response.json(
        { error: "Owners can only cancel a fulfillment" },
        { status: 400 },
      );
    }

    const updated = await sql`
      UPDATE rx_fulfillment_orders
      SET
        status = COALESCE(${status ?? null}, status),
        order_id = COALESCE(${order_id ?? null}, order_id),
        updated_at = now()
      WHERE id = ${id} AND owner_user_id = ${userId}
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
    if (/row-level security/i.test(e?.message ?? "")) {
      return Response.json(
        { error: "That change isn't allowed on this fulfillment" },
        { status: 400 },
      );
    }
    console.error("[PATCH /api/rx-fulfillment-orders/[id]] Error:", e?.message);
    return Response.json(
      { error: "Failed to update fulfillment" },
      { status: 500 },
    );
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
