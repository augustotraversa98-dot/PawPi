import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import {
  nextChargeAt,
  ALLOWED_PLANS,
} from "@/app/api/utils/payments/subscriptionCadence";

// /api/shop/subscriptions — the OWNER manages SHOP AUTO-REORDER plans. Phase 2 ticket 2.11
// (docs/phase2-tickets/2.11-shop-ecommerce.md).
//
// REUSES the 2.3 subscriptions table (0029) — a shop subscription = (a product + a cadence +
// a qty). 0037 added subscriptions.product_id + quantity; plan(text) carries the cadence
// ('monthly'…). The recurring scheduler (a 2.3 follow-up) re-buys product_id × quantity each
// next_charge_at via the SAME payment layer; this route lets the owner CREATE, LIST and
// CANCEL their plans. subscriptions RLS (0029) is the last line (owner FOR ALL).
//
// OWNER-context: authorization is the payer's identity (owner_user_id = me). No fake plans —
// empty → empty array (the UI shows an empty state).
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

    // The owner's shop subscriptions (product-backed), newest first. The provider + product
    // names label the plan. RLS scopes to the owner.
    const subscriptions = await sql`
      SELECT
        s.id, s.owner_user_id, s.provider_id, s.plan, s.status, s.next_charge_at,
        s.product_id, s.quantity, s.created_at,
        p.name AS provider_name,
        sp.name AS product_name, sp.price_cents, sp.image_urls
      FROM subscriptions s
      LEFT JOIN providers p ON p.id = s.provider_id
      LEFT JOIN shop_products sp ON sp.id = s.product_id
      WHERE s.owner_user_id = ${userId}
        AND s.product_id IS NOT NULL
      ORDER BY s.created_at DESC, s.id DESC
    `;

    return Response.json({ subscriptions });
  } catch (error) {
    console.error("[GET /api/shop/subscriptions] Error:", error?.message);
    return Response.json(
      { error: "Failed to fetch subscriptions" },
      { status: 500 },
    );
  }
}

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = (await request.json()) ?? {};
    const { product_id, plan, quantity } = body;

    if (!product_id) {
      return Response.json({ error: "product_id is required" }, { status: 400 });
    }
    if (!ALLOWED_PLANS.includes(plan)) {
      return Response.json(
        { error: `plan must be one of ${ALLOWED_PLANS.join(", ")}` },
        { status: 400 },
      );
    }
    const qty = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;

    // The product must be ACTIVE + in a published shop (RLS lets the owner read it). We also
    // capture its provider so the recurring order bills the right shop.
    const prodRows = await sql`
      SELECT id, provider_id, is_rx FROM shop_products
      WHERE id = ${product_id} AND active = true
    `;
    if (prodRows.length === 0) {
      return Response.json({ error: "Product not available" }, { status: 404 });
    }
    const product = prodRows[0];

    // Auto-reorder is for STAPLES (food, etc.), not prescription products — an Rx item must be
    // bought through the one-off checkout where the Rx gate runs each time. Refuse here.
    if (product.is_rx) {
      return Response.json(
        { error: "Prescription products cannot be set to auto-reorder" },
        { status: 400 },
      );
    }

    // Create the active subscription (cadence in plan; product + qty are the auto-reorder
    // target). owner_user_id = me (the RLS key). The initial purchase already happened via
    // the one-off checkout, so the FIRST auto-charge is ONE cadence from now — set
    // next_charge_at accordingly so the cron (2.17) can find it when due (without this it
    // stayed NULL and a plan never became due).
    const firstChargeAt = nextChargeAt(new Date(), plan);
    const created = await sql`
      INSERT INTO subscriptions
        (owner_user_id, provider_id, plan, status, product_id, quantity, next_charge_at)
      VALUES (
        ${userId}, ${product.provider_id}, ${plan}, 'active', ${product_id}, ${qty},
        ${firstChargeAt}
      )
      RETURNING *
    `;

    return Response.json({ subscription: created[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/shop/subscriptions] Error:", error?.message);
    return Response.json(
      { error: "Failed to create subscription" },
      { status: 500 },
    );
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
