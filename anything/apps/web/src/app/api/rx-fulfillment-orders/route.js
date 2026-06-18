import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/rx-fulfillment-orders — the OWNER side of Rx fulfillment (Wave 7 ticket 2.71).
//   GET  ?petId= — the owner's fulfillment orders for a pet (RLS owner_select), newest first.
//   POST          — request fulfillment of an OWNED, active, refillable Rx by a `pharmacy`-capable
//                   provider, delivery or pickup. RLS owner_insert (app_owns_fulfillable_rx) is the
//                   backstop: a stale/foreign Rx is rejected. The owner never writes the Rx itself.
//
// DB is porsager's tagged-template `sql`.
const METHODS = ["delivery", "pickup"];

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
    const { searchParams } = new URL(request.url);
    const petId = searchParams.get("petId");

    const rows = petId
      ? await sql`
          SELECT f.*, pr.drug_name, prov.name AS provider_name, o.status AS order_status
          FROM rx_fulfillment_orders f
          LEFT JOIN prescriptions pr ON pr.id = f.prescription_id
          LEFT JOIN providers prov ON prov.id = f.provider_id
          LEFT JOIN orders o ON o.id = f.order_id
          WHERE f.owner_user_id = ${userId} AND f.pet_id = ${petId}
          ORDER BY f.created_at DESC, f.id DESC
        `
      : await sql`
          SELECT f.*, pr.drug_name, prov.name AS provider_name, o.status AS order_status
          FROM rx_fulfillment_orders f
          LEFT JOIN prescriptions pr ON pr.id = f.prescription_id
          LEFT JOIN providers prov ON prov.id = f.provider_id
          LEFT JOIN orders o ON o.id = f.order_id
          WHERE f.owner_user_id = ${userId}
          ORDER BY f.created_at DESC, f.id DESC
        `;
    return Response.json({ orders: rows });
  } catch (e) {
    console.error("[GET /api/rx-fulfillment-orders] Error:", e?.message);
    return Response.json(
      { error: "Failed to load fulfillment orders" },
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
    const {
      prescription_id,
      provider_id,
      method = "delivery",
      delivery_lat,
      delivery_lng,
      delivery_address,
      provider_location_id,
      notes,
    } = body;

    if (!prescription_id || !provider_id) {
      return Response.json(
        { error: "prescription_id and provider_id are required" },
        { status: 400 },
      );
    }
    if (!METHODS.includes(method)) {
      return Response.json({ error: "Invalid method" }, { status: 400 });
    }
    if (method === "delivery" && !String(delivery_address ?? "").trim()) {
      return Response.json(
        { error: "A delivery address is required for delivery" },
        { status: 400 },
      );
    }

    // The dispenser must hold the `pharmacy` capability (clean 403 vs a later RLS error).
    await requireProviderCapability(provider_id, "pharmacy");

    // Resolve the pet from the owner's prescription (RLS scopes the read to the owner).
    const rxRows = await sql`
      SELECT pet_id FROM prescriptions
      WHERE id = ${prescription_id} AND owner_user_id = ${userId}
    `;
    if (rxRows.length === 0) {
      return Response.json({ error: "Prescription not found" }, { status: 404 });
    }

    // RLS WITH CHECK (app_owns_fulfillable_rx) enforces owned + active + refills-remaining. Each
    // fulfillment of a refillable Rx consumes one refill on the safe path at 'fulfilled'.
    const created = await sql`
      INSERT INTO rx_fulfillment_orders
        (prescription_id, owner_user_id, pet_id, provider_id, method,
         delivery_lat, delivery_lng, delivery_address, provider_location_id, is_refill, notes, status)
      VALUES (
        ${prescription_id}, ${userId}, ${rxRows[0].pet_id}, ${provider_id}, ${method},
        ${delivery_lat ?? null}, ${delivery_lng ?? null}, ${delivery_address ?? null},
        ${provider_location_id ?? null}, true, ${notes ?? null}, 'requested'
      )
      RETURNING *
    `;
    return Response.json({ order: created[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof ProviderAuthError || e.status === 403) {
      return Response.json({ error: e.message }, { status: 403 });
    }
    if (/row-level security/i.test(e?.message ?? "")) {
      return Response.json(
        { error: "This prescription isn't active or has no refills remaining" },
        { status: 400 },
      );
    }
    console.error("[POST /api/rx-fulfillment-orders] Error:", e?.message);
    return Response.json(
      { error: "Failed to request fulfillment" },
      { status: 500 },
    );
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
