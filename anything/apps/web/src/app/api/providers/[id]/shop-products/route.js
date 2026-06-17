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

// /api/providers/[id]/shop-products — a shop's CATALOG + INVENTORY. Phase 2 ticket 2.11
// (docs/phase2-tickets/2.11-shop-ecommerce.md).
//
// GET: gated by requireProviderCapability(providerId,'shop') — the MODULE gate (2.1).
// shop_products RLS (0037) scopes per-row visibility: a PUBLISHED shop's ACTIVE products are
// public-readable (DISCOVERY — an owner browses the catalog), while provider ADMINs also see
// inactive products + a draft shop. The route does NOT require staff membership — it is the
// shared "browse this shop" surface AND the shop's own catalog. Optional ?includeInactive=1
// is honoured only for admins (RLS already hides inactive rows from non-admins).
//
// POST (create a product): TWO gates, in order (none bypassed):
//   1. requireProviderCapability(providerId,'shop') — the MODULE gate (2.1).
//   2. requireProviderRole(providerId, me, ['owner','admin']) — catalog writes are
//      provider-ADMIN only (the ticket: "provider-admin writes").
//   3. RLS on shop_products (0037): the admin_all policy requires app_is_provider_admin — a
//      non-admin caller inserts ZERO. Catalog is provider CONFIGURATION, not pet data, so
//      there is no assertCareAccess here.
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

    // MODULE gate — the provider must hold the 'shop' capability (2.1). 403 if not.
    await requireProviderCapability(providerId, "shop");

    // RLS scopes which rows are visible (active-of-published for owners; all for admins).
    const products = await sql`
      SELECT
        id, provider_id, name, description, image_urls, price_cents, currency,
        stock_qty, category, is_rx, active, created_at, updated_at
      FROM shop_products
      WHERE provider_id = ${providerId}
      ORDER BY active DESC, created_at DESC, id DESC
    `;

    return Response.json({ products });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[GET /api/providers/[id]/shop-products] Error:", e?.message);
    return Response.json(
      { error: "Failed to fetch products" },
      { status: 500 },
    );
  }
}

async function POST(request, { params }) {
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

    // GATE 1 — the provider must HOLD the 'shop' capability (2.1). 403 if not.
    await requireProviderCapability(providerId, "shop");
    // GATE 2 — catalog writes are provider-admin only.
    await requireProviderRole(providerId, userId, ["owner", "admin"]);

    const body = (await request.json()) ?? {};
    const {
      name,
      description,
      image_urls,
      price_cents,
      currency,
      stock_qty,
      category,
      is_rx,
      active,
    } = body;

    if (!name || typeof name !== "string") {
      return Response.json({ error: "name is required" }, { status: 400 });
    }
    if (!Number.isInteger(price_cents) || price_cents < 0) {
      return Response.json(
        { error: "price_cents must be a non-negative integer" },
        { status: 400 },
      );
    }
    const imageError = invalidImageUrls(image_urls);
    if (imageError) {
      return Response.json({ error: imageError }, { status: 400 });
    }
    const stock =
      Number.isInteger(stock_qty) && stock_qty >= 0 ? stock_qty : 0;
    const images = Array.isArray(image_urls) ? image_urls : [];

    // Create the product. RLS scopes to admins of THIS provider (no admin → zero rows).
    const created = await sql`
      INSERT INTO shop_products (
        provider_id, name, description, image_urls, price_cents, currency,
        stock_qty, category, is_rx, active
      ) VALUES (
        ${providerId}, ${name}, ${description ?? null}, ${images}, ${price_cents},
        ${currency ?? "ARS"}, ${stock}, ${category ?? null}, ${is_rx === true},
        ${active === false ? false : true}
      )
      RETURNING *
    `;
    if (created.length === 0) {
      return Response.json(
        { error: "Not authorized to create a product for this provider" },
        { status: 403 },
      );
    }

    return Response.json({ product: created[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[POST /api/providers/[id]/shop-products] Error:", e?.message);
    return Response.json(
      { error: "Failed to create product" },
      { status: 500 },
    );
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
