import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { requireProviderRole, ALL_PROVIDER_ROLES } from "@/app/api/utils/providerAuth";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { isMissingSchema, presentOffer, toId } from "@/app/api/utils/shareOffers";

// GET /api/providers/[id]/share-offers → { available, offers: [{ id, pet_name, owner_name, sections, edit_sections,
// expiry, created_at, lapses_at }] }: owners' unanswered invitations to this business (migration 0154). Active staff only.
// Nothing from any record: the pet's name, the owner's display name, which parts and how long.
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

    const providerId = toId(params.id);
    if (providerId === null) {
      return Response.json({ error: "Not authorized for this provider" }, { status: 403 });
    }
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    let offers;
    try {
      offers = await withSavepoint(async () => {
        return await sql`
          SELECT id, pet_name, owner_name, sections, duration, created_at, lapses_at
          FROM app_provider_share_offers(${providerId}::int)
        `;
      });
    } catch (error) {
      if (!isMissingSchema(error)) throw error;
      return Response.json({ available: false, offers: [] });
    }

    // What the business would be able to add to (0158). Without it every invitation is view only.
    let edits = [];
    if (offers.length > 0) {
      try {
        edits = await withSavepoint(async () => {
          return await sql`SELECT id, edit_sections FROM app_provider_share_offer_edits(${providerId}::int)`;
        });
      } catch (error) {
        if (!isMissingSchema(error)) throw error;
      }
    }
    const editsOf = new Map(edits.map((e) => [e.id, e.edit_sections]));

    return Response.json({
      available: true,
      offers: offers.map((o) => presentOffer({ ...o, edit_sections: editsOf.get(o.id) ?? [] })),
    });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[GET /api/providers/[id]/share-offers] Error:", error.message);
    return Response.json({ error: "Failed to fetch invitations" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
