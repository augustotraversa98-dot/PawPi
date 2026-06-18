import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// DELETE /api/saved-places/[id] — unsave a favorite (Wave 7 ticket 2.73). RLS owner_all scopes the
// delete to the caller's own rows; a non-owner deletes ZERO → 404.
//
// DB is porsager's tagged-template `sql`.
async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const deleted = await sql`
      DELETE FROM saved_places
      WHERE id = ${params.id} AND owner_user_id = ${userId}
      RETURNING id
    `;
    if (deleted.length === 0) {
      return Response.json({ error: "Saved place not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/saved-places/[id]] Error:", e?.message);
    return Response.json({ error: "Failed to remove place" }, { status: 500 });
  }
}

const wrappedDELETE = withRequestContext(DELETE);
export { wrappedDELETE as DELETE };
