import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { withRateLimit } from "@/app/api/utils/rateLimit";
import { alertAdminsOfReport } from "@/app/api/utils/adminAlert";

// /api/reports — user-facing report/flag ledger (Guideline 1.2, ticket T2). Thin routes over
// the 0065 content_reports table (RLS pins reporter = caller).
//   POST — file a report { target_type, target_id, reason?, details? }. Idempotent: a second
//          open report by the same user on the same target is a no-op (returns the existing one).
//   GET  — the caller's own reports (so the UI can show "already reported").
//
// DB is porsager's tagged-template `sql`.

const TARGET_TYPES = new Set([
  "post", "bark", "forum_thread", "forum_comment", "dm_message", "provider_message",
  "review", "pet_profile", "user_profile", "adoption_listing", "event", "social_walk",
  "lost_report", "provider_post", "provider_post_comment",
]);
const REASONS = new Set(["spam", "harassment", "hate", "sexual", "violence", "other"]);

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) ?? {};
    const targetType = body.target_type;
    const targetId = Number(body.target_id);
    const reason = body.reason ?? null;
    const details = body.details ?? null;

    if (!TARGET_TYPES.has(targetType)) {
      return Response.json({ error: "Invalid target_type" }, { status: 400 });
    }
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return Response.json({ error: "Invalid target_id" }, { status: 400 });
    }
    if (reason !== null && !REASONS.has(reason)) {
      return Response.json({ error: "Invalid reason" }, { status: 400 });
    }

    // Idempotency: one open report per (reporter, target). A repeat is a no-op.
    const existing = await sql`
      SELECT * FROM content_reports
      WHERE reporter_user_id = ${userId}
        AND target_type = ${targetType} AND target_id = ${targetId}
        AND status = 'open' AND deleted_at IS NULL
      LIMIT 1
    `;
    if (existing.length > 0) {
      return Response.json({ report: existing[0], already_reported: true }, { status: 200 });
    }

    const created = await sql`
      INSERT INTO content_reports (reporter_user_id, target_type, target_id, reason, details)
      VALUES (${userId}, ${targetType}, ${targetId}, ${reason}, ${details})
      RETURNING *
    `;

    // MOD1: a GENUINELY NEW report (never the idempotent repeat above) must reach a human who
    // can act on it — alert every admin (in-app bell + rate-limited email). Best-effort and
    // savepoint-protected: it can neither throw, block, nor poison the report's transaction.
    await alertAdminsOfReport({ report: created[0], reporterId: userId, request });

    return Response.json({ report: created[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/reports] Error:", error.message);
    return Response.json({ error: "Failed to file report" }, { status: 500 });
  }
}

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) return Response.json({ reports: [] });

    const reports = await sql`
      SELECT id, target_type, target_id, reason, status, created_at
      FROM content_reports
      WHERE reporter_user_id = ${userId} AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 200
    `;
    return Response.json({ reports });
  } catch (error) {
    console.error("[GET /api/reports] Error:", error.message);
    return Response.json({ error: "Failed to load reports" }, { status: 500 });
  }
}

// PP3: the WRITE handlers are additionally wrapped with withRateLimit (utils/rateLimit)
// — a shared, DB-backed fixed-window counter. Reads are never limited.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(withRateLimit("report_create", POST));
export { wrappedGET as GET, wrappedPOST as POST };
