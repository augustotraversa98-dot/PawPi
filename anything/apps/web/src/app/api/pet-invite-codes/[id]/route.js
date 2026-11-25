import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";

// DELETE — the owner revokes one of their unused codes. The row is kept (revoked_at); it can never be redeemed again.
async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const userId = await resolveUserId(session.user.id);
    const id = parseInt(params?.id);
    if (!Number.isInteger(id)) return Response.json({ error: "Invalid code" }, { status: 400 });
    try {
      const rows = userId
        ? await withSavepoint(
            () => sql`
              UPDATE pet_invite_codes SET revoked_at = COALESCE(revoked_at, now())
              WHERE id = ${id} AND owner_user_id = ${userId} AND used_at IS NULL
              RETURNING id
            `,
          )
        : [];
      if (rows.length === 0) {
        return Response.json({ error: "We couldn't find that code.", code: "code_not_found" }, { status: 404 });
      }
      return Response.json({ ok: true });
    } catch (e) {
      if (e?.code === "42P01") {
        return Response.json(
          { error: "Invite codes aren't available yet. Please try again later.", code: "invite_codes_unavailable" },
          { status: 503 },
        );
      }
      throw e;
    }
  } catch (error) {
    console.error("[DELETE /api/pet-invite-codes/[id]] Error:", error.message);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

const wrappedDELETE = withRequestContext(DELETE);
export { wrappedDELETE as DELETE };
