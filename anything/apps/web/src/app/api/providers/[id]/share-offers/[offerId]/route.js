import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { requireProviderRole, ALL_PROVIDER_ROLES } from "@/app/api/utils/providerAuth";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { notifyShareAnswered } from "@/app/api/utils/careAccessNotify";
import { isMissingSchema, offersUnavailable, toId } from "@/app/api/utils/shareOffers";

const ACTIONS = { accept: true, decline: false };

// POST /api/providers/[id]/share-offers/[offerId] { action: 'accept'|'decline' } — active staff answer an owner's
// invitation (migration 0154). Accepting gives the business exactly the offered parts for the offered length, starting
// now. The database does the checks and the change in one locked step (app_respond_share_offer).
//   200 { status: 'accepted'|'declined', already?, pet_id, pet_name, expires_at } (`already`: the same answer was
//   given before, nothing changed) · 409 'offer_not_open' | 'not_eligible' | 'share_offers_unavailable' · 404 · 403
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

    const providerId = toId(params.id);
    if (providerId === null) {
      return Response.json({ error: "Not authorized for this provider" }, { status: 403 });
    }
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    const body = (await request.json().catch(() => null)) ?? {};
    if (!Object.hasOwn(ACTIONS, body.action)) {
      return Response.json({ error: "action must be 'accept' or 'decline'" }, { status: 400 });
    }
    const notFound = () => Response.json({ error: "Invitation not found" }, { status: 404 });
    const offerId = toId(params.offerId);
    if (offerId === null) return notFound();

    let result;
    try {
      result = await withSavepoint(async () => {
        const rows = await sql`
          SELECT outcome, pet, owner, pet_name, access_expires_at
          FROM app_respond_share_offer(${offerId}::int, ${providerId}::int, ${ACTIONS[body.action]}::boolean)
        `;
        return rows[0];
      });
    } catch (error) {
      if (!isMissingSchema(error)) throw error;
      return offersUnavailable();
    }

    const { outcome } = result ?? {};
    if (outcome === "not_open") {
      return Response.json(
        { error: "This invitation is no longer waiting", code: "offer_not_open" },
        { status: 409 },
      );
    }
    if (outcome === "not_eligible") {
      return Response.json(
        { error: "Only a published vet business can accept this invitation", code: "not_eligible" },
        { status: 409 },
      );
    }
    const already = outcome === "already_accepted" || outcome === "already_declined";
    const status = already ? outcome.slice("already_".length) : outcome;
    if (status !== "accepted" && status !== "declined") return notFound();

    if (!already) {
      await notifyShareAnswered({
        accepted: status === "accepted",
        ownerUserId: result.owner,
        providerId,
        petName: result.pet_name,
        expiresAt: result.access_expires_at,
        actor: userId,
      });
    }

    return Response.json({
      status,
      ...(already ? { already: true } : {}),
      pet_id: result.pet,
      pet_name: result.pet_name,
      expires_at: result.access_expires_at,
    });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[POST /api/providers/[id]/share-offers/[offerId]] Error:", error.message);
    return Response.json({ error: "Failed to answer the invitation" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
