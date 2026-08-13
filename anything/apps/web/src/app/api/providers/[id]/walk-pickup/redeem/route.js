import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderCapability,
  requireProviderRole,
  ALL_PROVIDER_ROLES,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { verifyPickupToken } from "@/app/api/utils/walkPickupToken";

// POST /api/providers/[id]/walk-pickup/redeem — the WALKER scans the owner's QR at pickup (Ticket
// B3). ONE atomic action: verify the signed token → deduct 1 credit → check in the walk (create the
// in_progress walk_session) → capture the walker's current GPS as the pickup point.
//
// Gates: requireProviderCapability(id,'walker') + active staff. The token must be valid, not
// expired, and bound to THIS provider (a token for provider A is rejected at provider B). The
// atomic decrement + session insert is app_redeem_walk_credit (DEFINER, 0090) — the ONLY credit
// spend path. 409 when the owner has no credits (friendly → buy a pack). 404 non-integer id before
// SQL. Degrade clean: an unmigrated prod (no helper) → a clear 404 "not available yet", never a 5xx.
//
// NON-credit walks keep using the existing pets/[petId]/walk-sessions check-in unchanged.
const isMissingObject = (e) =>
  e?.code === "42883" || // undefined_function
  e?.code === "42P01" || // undefined_table
  e?.code === "42703" || // undefined_column
  /does not exist/i.test(e?.message ?? "");

async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    if (!/^\d+$/.test(String(providerId))) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderCapability(providerId, "walker");
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    const body = (await request.json()) ?? {};
    const { token } = body;
    const lat = Number.isFinite(Number(body.lat)) ? Number(body.lat) : null;
    const lng = Number.isFinite(Number(body.lng)) ? Number(body.lng) : null;

    const payload = verifyPickupToken(token);
    if (!payload) {
      return Response.json({ error: "Invalid or expired pickup code" }, { status: 401 });
    }
    // The token must be for THIS provider — a token minted for provider A can't be redeemed at B.
    if (Number(payload.provider_id) !== Number(providerId)) {
      return Response.json({ error: "This pickup code is for a different walker" }, { status: 403 });
    }

    let rows;
    try {
      rows = await sql`
        SELECT app_redeem_walk_credit(
          ${providerId}, ${payload.pet_id}, ${lat}, ${lng}, ${null}
        ) AS session_id
      `;
    } catch (e) {
      // Degrade clean: unmigrated prod (no helper / pickup columns) → a clear "not set up yet".
      // A 404 (not 503) so an unmigrated prod doesn't register as a SERVER error — every sibling
      // Wave-B route degrades to a non-5xx status for this exact case (e.g. walk-package-checkout's
      // "Walk package not available" 404); this route was the one outlier still returning 5xx.
      // Mobile (useRedeemWalkPickup/walker-walks.jsx) only special-cases 409/401/403 and otherwise
      // shows `e.message` verbatim, so this is response-shape-identical for the walker.
      if (isMissingObject(e)) {
        return Response.json(
          { error: "Walk pickup isn't available yet" },
          { status: 404 },
        );
      }
      throw e;
    }

    const sessionId = rows?.[0]?.session_id ?? null;
    if (sessionId == null) {
      // No credits (or nothing to redeem) — friendly, actionable.
      return Response.json(
        { error: "No walks left — ask the owner to buy a pack", code: "no_credits" },
        { status: 409 },
      );
    }

    return Response.json({ session_id: sessionId }, { status: 201 });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    // The DEFINER helper raises 42501 if the caller isn't active staff (belt-and-suspenders).
    if (e?.code === "42501") {
      return Response.json({ error: "Not authorized for this provider" }, { status: 403 });
    }
    console.error("[POST /api/providers/[id]/walk-pickup/redeem] Error:", e?.message);
    return Response.json({ error: "Failed to redeem pickup" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
