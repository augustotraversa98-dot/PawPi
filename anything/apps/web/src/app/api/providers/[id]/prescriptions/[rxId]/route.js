import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// PATCH /api/providers/[id]/prescriptions/[rxId] — the issuing vet CANCELS an Rx (ticket 2.53).
// Cancel is a status transition (no hard delete); it flows through the cancel_rx DEFINER helper,
// which gates on active staff of the prescribing provider. Append-only history is preserved.
async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const providerId = params.id;
    const rxId = params.rxId;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    await requireProviderCapability(providerId, "vet");

    const body = (await request.json()) ?? {};
    if (body.status !== "cancelled") {
      return Response.json(
        { error: "Only cancellation is supported (clinical history is append-only)" },
        { status: 400 },
      );
    }

    const rows = await sql`SELECT cancel_rx(${rxId}) AS ok`;
    if (rows[0]?.ok !== true) {
      return Response.json(
        { error: "Not authorized to cancel this prescription" },
        { status: 403 },
      );
    }
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[PATCH .../prescriptions/[rxId]] Error:", e?.message);
    return Response.json({ error: "Failed to cancel prescription" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
