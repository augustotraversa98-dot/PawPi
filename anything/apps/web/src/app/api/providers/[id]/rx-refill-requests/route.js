import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/providers/[id]/rx-refill-requests — the vet's refill-request queue (ticket 2.53). RLS
// (rx_refill_requests_provider_select via app_staff_of_rx_provider) scopes to requests on THIS
// provider's prescriptions. Joins the Rx + pet for the queue card.
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
    await requireProviderCapability(providerId, "vet");

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const requests = status
      ? await sql`
          SELECT r.*, p.drug_name, p.refills_remaining, pet.name AS pet_name
          FROM rx_refill_requests r
          JOIN prescriptions p ON p.id = r.prescription_id
          LEFT JOIN pets pet ON pet.id = r.pet_id
          WHERE p.provider_id = ${providerId} AND r.status = ${status}
          ORDER BY r.requested_at DESC
        `
      : await sql`
          SELECT r.*, p.drug_name, p.refills_remaining, pet.name AS pet_name
          FROM rx_refill_requests r
          JOIN prescriptions p ON p.id = r.prescription_id
          LEFT JOIN pets pet ON pet.id = r.pet_id
          WHERE p.provider_id = ${providerId}
          ORDER BY r.requested_at DESC
        `;
    return Response.json({ requests });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[GET .../rx-refill-requests] Error:", e?.message);
    return Response.json({ error: "Failed to fetch refill requests" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
