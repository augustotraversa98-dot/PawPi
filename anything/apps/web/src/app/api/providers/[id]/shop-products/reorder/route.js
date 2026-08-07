import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { requireProviderRole, ProviderAuthError } from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/providers/[id]/shop-products/reorder — set the manual catalog order (Storefront Phase
// 2c-i; shop_products.sort_order from 0077). Owner|admin only. body { ordered_ids: number[] }
// — sort_order becomes the array index. The public/shop-products reads already order by
// is_featured DESC, sort_order ASC, so this drives the customer-facing order.
//
// ATOMIC + PROVIDER-SCOPED: the whole update is a SINGLE statement that unnest()s the ids
// with their index and matches sp.provider_id = ${providerId}, so ids that belong to another
// provider (or don't exist) simply match no row and are never touched. It runs inside the
// per-request transaction that withRequestContext opens (sql.begin), so it is all-or-nothing.
// (We do NOT open our own sql.begin here — inside a handler `sql` is already that transaction.)
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").
async function PATCH(request, { params }) {
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

    await requireProviderRole(providerId, userId, ["owner", "admin"]);

    const body = (await request.json()) ?? {};
    const orderedIds = body.ordered_ids;
    if (!Array.isArray(orderedIds) || !orderedIds.every((n) => Number.isInteger(n))) {
      return Response.json(
        { error: "ordered_ids must be an array of integers" },
        { status: 422 },
      );
    }

    // Empty list → nothing to do (idempotent no-op).
    if (orderedIds.length > 0) {
      const positions = orderedIds.map((_, i) => i);
      await sql`
        UPDATE shop_products AS sp
        SET sort_order = v.ord, updated_at = now()
        FROM unnest(${orderedIds}::int[], ${positions}::int[]) AS v(id, ord)
        WHERE sp.id = v.id AND sp.provider_id = ${providerId}
      `;
    }

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[PATCH /api/providers/[id]/shop-products/reorder] Error:", e?.message);
    return Response.json({ error: "Failed to reorder products" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
