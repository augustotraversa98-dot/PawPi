import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderRole,
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { invalidImageUrls } from "@/app/api/utils/providerValidation";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/providers/[id]/shop-products/[productId] — update / soft-delete one catalog product.
// Phase 2 ticket 2.11. Provider-ADMIN only (catalog/inventory management).
//
// PATCH: edit any of name/description/image_urls/price_cents/currency/stock_qty/category/
// is_rx/active. DELETE: SOFT delete — sets active=false (project convention: never hard-
// delete; historical order_items keep their product_id). Both gate the 'shop' capability +
// admin role; shop_products RLS (0037) is the last line (admin_all).
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").
async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: providerId, productId } = params;
    // Defense-in-depth: a non-integer productId (e.g. a static path like "reorder" that reached
    // this dynamic handler) must never be bound as an integer in SQL — 404 before any DB call.
    if (!/^\d+$/.test(String(productId))) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderCapability(providerId, "shop");
    await requireProviderRole(providerId, userId, ["owner", "admin"]);

    const body = (await request.json()) ?? {};

    // Validate the numeric fields when present.
    if (
      body.price_cents !== undefined &&
      (!Number.isInteger(body.price_cents) || body.price_cents < 0)
    ) {
      return Response.json(
        { error: "price_cents must be a non-negative integer" },
        { status: 400 },
      );
    }
    if (
      body.stock_qty !== undefined &&
      (!Number.isInteger(body.stock_qty) || body.stock_qty < 0)
    ) {
      return Response.json(
        { error: "stock_qty must be a non-negative integer" },
        { status: 400 },
      );
    }
    const imageError = invalidImageUrls(body.image_urls);
    if (imageError) {
      return Response.json({ error: imageError }, { status: 400 });
    }

    // compare_at_cents (the "was" price for a discount badge, 0077) — null clears the
    // discount; a number MUST be a non-negative int AND exceed the EFFECTIVE price (the new
    // price_cents when it is also being set in this PATCH, else the stored one). This mirrors
    // the 0077 CHECK (compare_at_cents IS NULL OR compare_at_cents > price_cents) so a bad
    // value fails with a clean 422 instead of a DB error.
    if (body.compare_at_cents !== undefined && body.compare_at_cents !== null) {
      if (!Number.isInteger(body.compare_at_cents) || body.compare_at_cents < 0) {
        return Response.json(
          { error: "compare_at_cents must be a non-negative integer or null" },
          { status: 422 },
        );
      }
      let effectivePrice = body.price_cents;
      if (!Number.isInteger(effectivePrice)) {
        const rows = await sql`
          SELECT price_cents FROM shop_products
          WHERE id = ${productId} AND provider_id = ${providerId}
        `;
        if (rows.length === 0) {
          return Response.json({ error: "Product not found" }, { status: 404 });
        }
        effectivePrice = rows[0].price_cents;
      }
      if (body.compare_at_cents <= effectivePrice) {
        return Response.json(
          { error: "compare_at_cents must be greater than price_cents" },
          { status: 422 },
        );
      }
    }

    // COALESCE keeps unspecified fields. RLS (admin_all) + the provider_id filter scope the
    // row to THIS shop's admin — a non-admin updates ZERO rows (handled as 404 below).
    const updated = await sql`
      UPDATE shop_products
      SET
        name = COALESCE(${body.name ?? null}, name),
        description = COALESCE(${body.description ?? null}, description),
        image_urls = COALESCE(${
          Array.isArray(body.image_urls) ? body.image_urls : null
        }, image_urls),
        price_cents = COALESCE(${body.price_cents ?? null}, price_cents),
        currency = COALESCE(${body.currency ?? null}, currency),
        stock_qty = COALESCE(${body.stock_qty ?? null}, stock_qty),
        category = COALESCE(${body.category ?? null}, category),
        is_rx = COALESCE(${body.is_rx === undefined ? null : body.is_rx}, is_rx),
        active = COALESCE(${body.active === undefined ? null : body.active}, active),
        is_featured = COALESCE(${body.is_featured === undefined ? null : body.is_featured}, is_featured),
        compare_at_cents = CASE WHEN ${body.compare_at_cents !== undefined}
          THEN ${body.compare_at_cents ?? null} ELSE compare_at_cents END,
        updated_at = now()
      WHERE id = ${productId} AND provider_id = ${providerId}
      RETURNING *
    `;
    if (updated.length === 0) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    return Response.json({ product: updated[0] });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[PATCH /api/providers/[id]/shop-products/[productId]] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to update product" },
      { status: 500 },
    );
  }
}

async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: providerId, productId } = params;
    // Defense-in-depth: a non-integer productId (e.g. a static path like "reorder" that reached
    // this dynamic handler) must never be bound as an integer in SQL — 404 before any DB call.
    if (!/^\d+$/.test(String(productId))) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderCapability(providerId, "shop");
    await requireProviderRole(providerId, userId, ["owner", "admin"]);

    // SOFT delete — active=false (the product disappears from discovery, historical lines
    // keep their product_id link). Never a hard DELETE.
    const updated = await sql`
      UPDATE shop_products
      SET active = false, updated_at = now()
      WHERE id = ${productId} AND provider_id = ${providerId}
      RETURNING id
    `;
    if (updated.length === 0) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[DELETE /api/providers/[id]/shop-products/[productId]] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to delete product" },
      { status: 500 },
    );
  }
}

const wrappedPATCH = withRequestContext(PATCH);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedPATCH as PATCH, wrappedDELETE as DELETE };
