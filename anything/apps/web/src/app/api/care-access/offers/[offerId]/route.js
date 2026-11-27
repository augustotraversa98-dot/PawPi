import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { isMissingSchema, toId } from "@/app/api/utils/shareOffers";

// PATCH /api/care-access/offers/[offerId] { action: 'withdraw' } — the owner takes back an unanswered invitation.
// 200 { offer: { id, status: 'withdrawn' } } (also when it already was) · 409 'offer_accepted' (end that access in
// /api/care-access/grants) · 409 'offer_closed' (declined or lapsed) · 404 for anyone else's. Never rate limited.
async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) ?? {};
    if (body.action !== "withdraw") {
      return Response.json({ error: "action must be 'withdraw'" }, { status: 400 });
    }

    const notFound = () => Response.json({ error: "Invitation not found" }, { status: 404 });
    const offerId = toId(params.offerId);
    if (offerId === null) return notFound();

    let current;
    try {
      current = await withSavepoint(async () => {
        // Only an unanswered one changes; an answer being given right now is waited for.
        const withdrawn = await sql`
          UPDATE care_share_offers
          SET status = 'withdrawn', responded_at = now()
          WHERE id = ${offerId} AND owner_user_id = ${userId} AND status = 'open'
          RETURNING id, status
        `;
        if (withdrawn.length > 0) return withdrawn[0];
        const rows = await sql`
          SELECT id, status FROM care_share_offers
          WHERE id = ${offerId} AND owner_user_id = ${userId}
        `;
        return rows[0] ?? null;
      });
    } catch (error) {
      if (!isMissingSchema(error)) throw error;
      return notFound();
    }

    if (current === null) return notFound();
    if (current.status === "withdrawn") {
      return Response.json({ offer: { id: current.id, status: current.status } });
    }
    if (current.status === "accepted") {
      return Response.json(
        { error: "This invitation was already accepted. Revoke the access instead.", code: "offer_accepted" },
        { status: 409 },
      );
    }
    return Response.json(
      { error: "This invitation is no longer waiting", code: "offer_closed" },
      { status: 409 },
    );
  } catch (error) {
    console.error("[PATCH /api/care-access/offers/[offerId]] Error:", error.message);
    return Response.json({ error: "Failed to update the invitation" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
