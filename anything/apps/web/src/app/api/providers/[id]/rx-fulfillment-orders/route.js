import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/providers/[id]/rx-fulfillment-orders — the dispensing provider's Rx fulfillment QUEUE
// (Wave 7 ticket 2.71). Capability-gated to `pharmacy`; RLS (rx_fulfillment_staff_select) scopes to
// active staff of THIS provider — another provider's staff sees ZERO. The drug name comes from the
// linked Rx (the only clinical field surfaced — fulfillment never pulls the whole Vet Record).
//
// DB is porsager's tagged-template `sql`.
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
    await requireProviderCapability(providerId, "pharmacy");

    const orders = await sql`
      SELECT
        f.id, f.prescription_id, f.pet_id, f.owner_user_id, f.method,
        f.delivery_address, f.provider_location_id, f.price_cents, f.status,
        f.is_refill, f.notes, f.order_id, f.created_at,
        pr.drug_name, pr.strength, pr.dose, pr.refills_remaining,
        p.name AS pet_name,
        COALESCE(up.full_name, up.username) AS owner_name,
        o.status AS order_status
      FROM rx_fulfillment_orders f
      LEFT JOIN prescriptions pr ON pr.id = f.prescription_id
      LEFT JOIN pets p ON p.id = f.pet_id
      LEFT JOIN user_profiles up ON up.id = f.owner_user_id
      LEFT JOIN orders o ON o.id = f.order_id
      WHERE f.provider_id = ${providerId}
      ORDER BY f.created_at DESC, f.id DESC
    `;
    return Response.json({ orders });
  } catch (e) {
    if (e instanceof ProviderAuthError || e.status === 403) {
      return Response.json({ error: e.message }, { status: 403 });
    }
    console.error(
      "[GET /api/providers/[id]/rx-fulfillment-orders] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to load fulfillment queue" },
      { status: 500 },
    );
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
