import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// PATCH /api/providers/[id]/rx-refill-requests/[requestId] — the vet approves/declines a refill
// (ticket 2.53). The decision flows through decide_rx_refill (DEFINER), which gates on active staff
// of the prescribing provider and decrements refills_remaining on approve — the owner never writes
// prescription fields.
async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const providerId = params.id;
    const requestId = params.requestId;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    await requireProviderCapability(providerId, "vet");

    const body = (await request.json()) ?? {};
    if (body.decision !== "approve" && body.decision !== "decline") {
      return Response.json(
        { error: "decision must be 'approve' or 'decline'" },
        { status: 400 },
      );
    }
    const approve = body.decision === "approve";

    const rows = await sql`
      SELECT decide_rx_refill(${requestId}, ${approve}, ${body.note ?? null}) AS result
    `;
    const result = rows[0]?.result;
    if (result === "forbidden") {
      return Response.json({ error: "Not authorized" }, { status: 403 });
    }
    if (result === "not_found") {
      return Response.json({ error: "Request not found" }, { status: 404 });
    }
    if (result === "already_decided") {
      return Response.json({ error: "Request already decided" }, { status: 409 });
    }
    return Response.json({ status: result });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[PATCH .../rx-refill-requests/[requestId]] Error:", e?.message);
    return Response.json({ error: "Failed to decide refill" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
