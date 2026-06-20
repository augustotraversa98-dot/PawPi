import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/admin/reports/[id]/action — act on a report (Guideline 1.2, T2). Admin-only.
//   body { action: 'hide'|'remove'|'dismiss', ban?: boolean }
// Routes through the app_admin_action_report() SECURITY DEFINER helper (0065): 'hide'/'remove'
// set the content's hidden_at + flip its open reports to 'actioned'; ban=true also stamps the
// content author's banned_at; 'dismiss' just closes the report.
//
// DB is porsager's tagged-template `sql`.

const ACTIONS = new Set(["hide", "remove", "dismiss"]);

async function POST(request, { params }) {
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

    const reportId = Number(params.id);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      return Response.json({ error: "Invalid report id" }, { status: 400 });
    }
    const body = (await request.json()) ?? {};
    const action = body.action;
    const ban = body.ban === true;
    if (!ACTIONS.has(action)) {
      return Response.json({ error: "Invalid action" }, { status: 400 });
    }

    try {
      await sql`SELECT app_admin_action_report(${reportId}, ${action}, ${ban})`;
    } catch (e) {
      if (/report not found/i.test(e.message)) {
        return Response.json({ error: "Report not found" }, { status: 404 });
      }
      throw e;
    }
    return Response.json({ actioned: true, action, ban });
  } catch (error) {
    console.error("[POST /api/admin/reports/[id]/action] Error:", error.message);
    return Response.json({ error: "Failed to action report" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
