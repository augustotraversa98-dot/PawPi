import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/admin/reports — the JSON moderation queue (Guideline 1.2, T2). Admin-only.
// Reads via the app_admin_list_reports_v2() SECURITY DEFINER helper (0116) because under FORCE RLS
// content_reports' reporter-own SELECT policy hides other users' reports. v2 enriches each row into
// a triage card: reporter handle + distinct reporters_count, and the target's author handle, content
// preview (text snippet + image url), and its own created_at — resolved polymorphically per
// target_type in one call. ?status=open|actioned|dismissed|all (default 'open').
//
// DB is porsager's tagged-template `sql`.

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const [{ is_admin }] = await sql`SELECT app_is_admin() AS is_admin`;
    if (!is_admin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status") ?? "open";
    const status = statusParam === "all" ? null : statusParam;

    const reports = await sql`SELECT * FROM app_admin_list_reports_v2(${status})`;
    return Response.json({ reports });
  } catch (error) {
    console.error("[GET /api/admin/reports] Error:", error.message);
    return Response.json({ error: "Failed to load moderation queue" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
