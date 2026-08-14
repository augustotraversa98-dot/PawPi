import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";

// GET / PUT /api/engagement/weekly-digest-prefs — the owner's "Rex's Week" channel toggles (E11).
//
// Server-side (unlike E5's client-only per-category toggles) because the weekly delivery job runs
// server-side and must respect the choice. Defaults: push ON, email OFF. Owner-scoped: the row is
// keyed to the caller's user_profiles.id and gated by weekly_digest_prefs' own-row RLS. Degrades
// cleanly pre-migration (missing table → defaults, never a 500).

const UNDEFINED_TABLE = "42P01";
const isMissingTable = (e) => e?.code === UNDEFINED_TABLE;
const DEFAULTS = { push_enabled: true, email_enabled: false };

async function requireOwner(session) {
  if (!session?.user?.id) return { error: "Unauthorized", status: 401 };
  const ownerUserId = await resolveUserId(session.user.id);
  if (ownerUserId === null) return { error: "User profile not found", status: 404 };
  return { ownerUserId };
}

async function readPrefs(ownerUserId) {
  let prefs = { ...DEFAULTS };
  try {
    await withSavepoint(async () => {
      const [row] = await sql`
        SELECT push_enabled, email_enabled FROM weekly_digest_prefs WHERE owner_user_id = ${ownerUserId}
      `;
      if (row) prefs = { push_enabled: !!row.push_enabled, email_enabled: !!row.email_enabled };
    });
  } catch (e) {
    if (!isMissingTable(e)) throw e; // pre-migration → defaults
  }
  return prefs;
}

async function GET() {
  try {
    const session = await auth();
    const gate = await requireOwner(session);
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });
    const prefs = await readPrefs(gate.ownerUserId);
    return Response.json({ ...prefs });
  } catch (error) {
    console.error("[GET /api/engagement/weekly-digest-prefs] ERROR:", error.message);
    return Response.json({ error: "Failed to load preferences" }, { status: 500 });
  }
}

async function PUT(request) {
  try {
    const session = await auth();
    const gate = await requireOwner(session);
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });
    const { ownerUserId } = gate;

    const body = await request.json().catch(() => ({}));
    const current = await readPrefs(ownerUserId);
    const push = typeof body.push_enabled === "boolean" ? body.push_enabled : current.push_enabled;
    const email = typeof body.email_enabled === "boolean" ? body.email_enabled : current.email_enabled;

    try {
      await withSavepoint(async () => {
        await sql`
          INSERT INTO weekly_digest_prefs (owner_user_id, push_enabled, email_enabled, updated_at)
          VALUES (${ownerUserId}, ${push}, ${email}, now())
          ON CONFLICT (owner_user_id) DO UPDATE SET
            push_enabled = EXCLUDED.push_enabled,
            email_enabled = EXCLUDED.email_enabled,
            updated_at = now()
        `;
      });
    } catch (e) {
      if (!isMissingTable(e)) throw e;
      return Response.json({ error: "Weekly digest isn't available yet", degraded: true }, { status: 503 });
    }
    return Response.json({ push_enabled: push, email_enabled: email });
  } catch (error) {
    console.error("[PUT /api/engagement/weekly-digest-prefs] ERROR:", error.message);
    return Response.json({ error: "Failed to save preferences" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPUT = withRequestContext(PUT);
export { wrappedGET as GET, wrappedPUT as PUT };
