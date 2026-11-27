import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { answer, isMissingSchema } from "@/app/api/utils/recordLink";
import { updateLinkShare } from "@/app/api/utils/editShare";

// PATCH /api/care-access/links/[linkId] { action: 'revoke' } — the owner removes a record link. It stops working on the
// next request made with it. 200 { link: { id, status: 'revoked', revoked_at } } (also when it was already revoked);
// 404 for anyone else's. Removing is never rate limited.
// { action: 'update', sections, editSections, expiry } changes what the same link opens (utils/editShare.js).
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
    if (body.action !== "revoke" && body.action !== "update") {
      return Response.json({ error: "action must be 'revoke' or 'update'" }, { status: 400 });
    }

    const notFound = () => Response.json({ error: "Link not found" }, { status: 404 });
    if (!/^\d{1,9}$/.test(String(params.linkId))) return notFound();
    const linkId = Number(params.linkId);

    if (body.action === "update") {
      return await updateLinkShare({ request, linkId, userId, body });
    }

    let revoked;
    try {
      revoked = await withSavepoint(async () => {
        return await sql`
          UPDATE care_record_links
          SET revoked_at = COALESCE(revoked_at, now())
          WHERE id = ${linkId} AND owner_user_id = ${userId}
          RETURNING id, revoked_at
        `;
      });
    } catch (error) {
      if (!isMissingSchema(error)) throw error;
      return notFound();
    }
    if (revoked.length === 0) return notFound();
    return answer({ link: { ...revoked[0], status: "revoked" } });
  } catch (error) {
    console.error("[PATCH /api/care-access/links/[linkId]] Error:", error.message);
    return Response.json({ error: "Failed to update link" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
