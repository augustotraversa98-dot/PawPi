import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { requireProviderRole, ProviderAuthError } from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/providers/[id]/services/reorder — set the manual services order (Storefront Phase
// 2c-i; provider_services.sort_order from 0077). Owner|admin only. body { ordered_ids:
// number[] } — sort_order becomes the array index. The public read orders by is_featured
// DESC, sort_order ASC, so this drives the customer-facing order.
//
// ATOMIC + PROVIDER-SCOPED: one unnest() statement matching sp.provider_id = ${providerId}
// so ids from another provider (or non-existent) are never touched; it runs inside the
// per-request transaction withRequestContext opens (do NOT open sql.begin inside a handler —
// `sql` is already that transaction there). Mirrors shop-products/reorder.
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

    if (orderedIds.length > 0) {
      const positions = orderedIds.map((_, i) => i);
      await sql`
        UPDATE provider_services AS ps
        SET sort_order = v.ord, updated_at = now()
        FROM unnest(${orderedIds}::int[], ${positions}::int[]) AS v(id, ord)
        WHERE ps.id = v.id AND ps.provider_id = ${providerId}
      `;
    }

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[PATCH /api/providers/[id]/services/reorder] Error:", e?.message);
    return Response.json({ error: "Failed to reorder services" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
