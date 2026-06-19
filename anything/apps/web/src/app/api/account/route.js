import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// DELETE /api/account — in-app ACCOUNT DELETION (App Store readiness, ticket 2.78; Apple 5.1.1(v)).
// Irreversibly deletes the CALLER's account + all owner-scoped data via the SECURITY DEFINER
// delete_my_account() (0062), then the client clears its session/token and returns to onboarding.
// This is DISTINCT from "Reset App Data" (a local logout) — it removes the account server-side.
//
// DB is porsager's tagged-template `sql`.
async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Establish the caller's identity so delete_my_account() resolves current_app_user_id(). A user
    // with no profile yet (never created a pet) still has an auth row — fall back to deleting that.
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      await sql`DELETE FROM auth_users WHERE id = ${session.user.id}`;
      return Response.json({ ok: true, deleted: "auth_only" });
    }

    const res = await sql`SELECT delete_my_account() AS ok`;
    if (!res[0]?.ok) {
      return Response.json({ error: "Account not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/account] Error:", error.message);
    return Response.json({ error: "Failed to delete account" }, { status: 500 });
  }
}

const wrappedDELETE = withRequestContext(DELETE);
export { wrappedDELETE as DELETE };
