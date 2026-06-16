import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderRole,
  ALL_PROVIDER_ROLES,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { payout } from "@/app/api/utils/payments";
import {
  SUPPORTED_RAILS,
  PaymentsNotConfiguredError,
} from "@/app/api/utils/payments/config";

// /api/providers/[id]/payouts — provider settlements (ticket 2.3).
//   GET  — list this provider's payouts (any active staff; payouts RLS = staff read).
//   POST — initiate a payout for amount_cents on a rail (owner|admin only). Calls the
//          provider-agnostic payout() which hits the rail's Payout API + records a row.
// Owners never see payouts (no owner branch anywhere). Missing key → 503.
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const providerId = params.id;
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    const rows = await sql`
      SELECT * FROM payouts WHERE provider_id = ${providerId}
      ORDER BY created_at DESC
    `;
    return Response.json({ payouts: rows });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[GET /api/providers/[id]/payouts] Error:", error.message);
    return Response.json({ error: "Failed to fetch payouts" }, { status: 500 });
  }
}

async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const providerId = params.id;
    // owner|admin only.
    await requireProviderRole(providerId, userId);

    const body = (await request.json()) ?? {};
    const { amount_cents, rail } = body;
    if (!Number.isInteger(amount_cents) || amount_cents <= 0) {
      return Response.json(
        { error: "amount_cents must be a positive integer" },
        { status: 400 },
      );
    }
    if (!SUPPORTED_RAILS.includes(rail)) {
      return Response.json({ error: `Invalid rail: ${rail}` }, { status: 400 });
    }

    const providerRows = await sql`
      SELECT * FROM providers WHERE id = ${providerId} LIMIT 1
    `;
    if (providerRows.length === 0) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    const result = await payout(providerRows[0], amount_cents, { rail });
    return Response.json({ payout: result.payout }, { status: 201 });
  } catch (error) {
    if (error instanceof PaymentsNotConfiguredError || error.status === 503) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[POST /api/providers/[id]/payouts] Error:", error.message);
    return Response.json({ error: "Failed to initiate payout" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
