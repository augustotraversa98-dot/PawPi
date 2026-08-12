import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  requireProviderRole,
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/providers/[id]/adoptable-listings/[listingId]/relist — put a listing BACK UP for
// adoption (adoption applications v2). Undoes a mistaken accept / a premature "adopted" mark:
//   • flips the listing status back to 'available' so it re-enters discovery; and
//   • for the mistaken-APPROVE case (a listing marked 'adopted' with an 'approved' application),
//     RE-OPENS that application to 'under_review' so the shelter can decide again.
//
// It deliberately does NOT undo the pet TRANSFER — the adopter keeps the transferred pet as
// history (full transfer-reversal is out of scope). A plain shelter-ADMIN-gated UPDATE flips both
// rows safely under the existing 0038 RLS (adoptable_listings admin_all + adoption_applications
// staff-update), so no new SECURITY DEFINER helper is needed. The partial unique index
// (applicant_owner_user_id, listing_id) WHERE status <> 'declined' is respected: re-opening an
// approved row to under_review keeps it a single non-declined row (no new active row).
//
// Static "relist" segment under [listingId] (no [param] sibling) → no static-vs-[param] routing
// collision; the URL-level integration test proves routing through the real Hono router.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").
async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: providerId, listingId } = params;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderCapability(providerId, "adoption");
    await requireProviderRole(providerId, userId, ["owner", "admin"]);

    // Read the listing's current status (staff RLS sees all of its place's listings, incl.
    // adopted). Scoped to THIS place — a wrong place / missing listing → 404.
    const listingRows = await sql`
      SELECT id, status FROM adoptable_listings
      WHERE id = ${listingId} AND provider_id = ${providerId}
    `;
    if (listingRows.length === 0) {
      return Response.json({ error: "Listing not found" }, { status: 404 });
    }
    const wasAdopted = listingRows[0].status === "adopted";

    // Flip the listing back to available. RLS (admin_all) + the provider_id filter scope the row
    // to THIS place's admin — a non-admin updates ZERO rows (handled as 404 below).
    const updated = await sql`
      UPDATE adoptable_listings
      SET status = 'available', updated_at = now()
      WHERE id = ${listingId} AND provider_id = ${providerId}
      RETURNING *
    `;
    if (updated.length === 0) {
      return Response.json({ error: "Listing not found" }, { status: 404 });
    }

    // Mistaken-approve undo: re-open the approved application(s) for this listing so the shelter
    // can review again. Only runs when the listing had been 'adopted' (i.e. an approval happened).
    // The transferred pet is intentionally left in place (history). Staff-update RLS allows this;
    // a non-staff caller would touch zero rows.
    let reopened = [];
    if (wasAdopted) {
      reopened = await sql`
        UPDATE adoption_applications
        SET status = 'under_review', updated_at = now()
        WHERE listing_id = ${listingId} AND provider_id = ${providerId}
          AND status = 'approved'
        RETURNING id
      `;
    }

    return Response.json({
      listing: updated[0],
      reopened_application_ids: reopened.map((r) => r.id),
    });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[POST /api/providers/[id]/adoptable-listings/[listingId]/relist] Error:",
      e?.message,
    );
    return Response.json({ error: "Failed to re-list" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
