import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/admin/moderation-summary — a cheap capability probe for the moderation nav link
// (MOD2 PR2). Answers two things the provider shell needs to render the admin entry point:
//   { is_admin: boolean, open_count: number }
// It is NOT a data endpoint — an admin sees only a count, a non-admin gets is_admin:false (200,
// not 403) so the client can quietly branch without treating "you're not an admin" as an error.
// The open count comes from the admin-only DEFINER reader (0116), which returns zero rows for a
// non-admin anyway; we still gate on app_is_admin() first so a non-admin never runs it.
//
// DB is porsager's tagged-template `sql`.

async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      // A signed-in user with no resolvable profile is simply not an admin.
      return Response.json({ is_admin: false, open_count: 0 });
    }
    const [{ is_admin }] = await sql`SELECT app_is_admin() AS is_admin`;
    if (!is_admin) {
      return Response.json({ is_admin: false, open_count: 0 });
    }
    const [{ open_count }] = await sql`
      SELECT count(*)::int AS open_count FROM app_admin_list_reports_v2('open')
    `;
    return Response.json({ is_admin: true, open_count });
  } catch (error) {
    console.error("[GET /api/admin/moderation-summary] Error:", error.message);
    // Fail closed for the badge (no link) but never surface a hard error to the shell.
    return Response.json({ is_admin: false, open_count: 0 }, { status: 200 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
