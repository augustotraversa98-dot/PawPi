import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { withRateLimit } from "@/app/api/utils/rateLimit";
import { bizNotifyBody } from "@/app/api/utils/notify";
import { notifyProviderTeam } from "@/app/api/utils/providerNotify";

// /api/providers/[id]/follow — a signed-in pet owner follows / unfollows a provider (ticket 2.92).
//   • GET    → { following, followersCount } for the current user + this provider.
//   • POST   → follow (idempotent). Returns { following: true, followersCount }.
//   • DELETE → unfollow. Returns { following: false, followersCount }.
//
// DEGRADE CLEANLY: the provider_follows table (migration 0083) is hand-applied to Supabase AFTER
// this code deploys, so every read/write treats a missing table (Postgres undefined_table, 42P01)
// as "not following / 0 followers" and NEVER 500s — the button just no-ops until the table exists.
// RLS (0083): a user writes ONLY their own follow rows; reads are any-authed (edge table only).

const UNDEFINED_TABLE = "42P01";
const isMissingTable = (e) => e?.code === UNDEFINED_TABLE;

// 404-guard a non-integer id BEFORE it reaches SQL (route hard-lesson).
const isIntId = (v) => /^\d+$/.test(String(v));

async function followerCount(providerId) {
  try {
    const rows = await sql`
      SELECT COUNT(*)::int AS count FROM provider_follows WHERE provider_id = ${providerId}
    `;
    return rows[0].count;
  } catch (e) {
    if (isMissingTable(e)) return 0; // pre-migration → 0 followers
    throw e;
  }
}

async function requireCaller(session, providerId) {
  if (!session?.user?.id) return { error: "Unauthorized", status: 401 };
  if (!isIntId(providerId)) return { error: "Provider not found", status: 404 };
  const userId = await resolveUserId(session.user.id);
  if (userId === null) return { error: "User profile not found", status: 404 };
  return { userId };
}

async function GET(request, { params }) {
  try {
    const gate = await requireCaller(await auth(), params.id);
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });
    const providerId = params.id;

    let following = false;
    try {
      const rows = await sql`
        SELECT 1 FROM provider_follows
        WHERE follower_user_id = ${gate.userId} AND provider_id = ${providerId}
        LIMIT 1
      `;
      following = rows.length > 0;
    } catch (e) {
      if (!isMissingTable(e)) throw e; // pre-migration → not following
    }

    const followersCount = await followerCount(providerId);
    return Response.json({ following, followersCount });
  } catch (e) {
    console.error("[GET /api/providers/[id]/follow] Error:", e?.message);
    return Response.json({ error: "Failed to load follow state" }, { status: 500 });
  }
}

async function POST(request, { params }) {
  try {
    const gate = await requireCaller(await auth(), params.id);
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });
    const providerId = params.id;

    // The provider must exist (providers always exists — the FK target). 404 otherwise.
    const prov = await sql`SELECT id FROM providers WHERE id = ${providerId} LIMIT 1`;
    if (prov.length === 0) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    let inserted = [];
    try {
      inserted = await sql`
        INSERT INTO provider_follows (follower_user_id, provider_id)
        VALUES (${gate.userId}, ${providerId})
        ON CONFLICT (follower_user_id, provider_id) DO NOTHING
        RETURNING id
      `;
    } catch (e) {
      // Pre-migration: accept the tap as a no-op so the UI never errors; it re-syncs once
      // the table exists (the button reverts to "Follow" on the next GET).
      if (isMissingTable(e)) {
        return Response.json({ following: false, followersCount: 0, pending: true });
      }
      throw e;
    }

    // ENGAGEMENT NOTIFICATION (BN2 biz_follow, IN_APP_ONLY — a bell, never a push). Only on a
    // genuinely NEW follow (ON CONFLICT DO NOTHING returns no row on a re-follow), so a repeat
    // tap doesn't re-notify. Owner-only per the catalog. actor = the follower.
    if (inserted?.length > 0) {
      await notifyProviderTeam({
        providerId,
        actor: gate.userId,
        type: "biz_follow",
        subjectRef: providerId,
        body: bizNotifyBody({ kind: "follow" }),
        ownerOnly: true,
      });
    }

    const followersCount = await followerCount(providerId);
    return Response.json({ following: true, followersCount });
  } catch (e) {
    console.error("[POST /api/providers/[id]/follow] Error:", e?.message);
    return Response.json({ error: "Failed to follow provider" }, { status: 500 });
  }
}

async function DELETE(request, { params }) {
  try {
    const gate = await requireCaller(await auth(), params.id);
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });
    const providerId = params.id;

    try {
      await sql`
        DELETE FROM provider_follows
        WHERE follower_user_id = ${gate.userId} AND provider_id = ${providerId}
      `;
    } catch (e) {
      if (isMissingTable(e)) {
        return Response.json({ following: false, followersCount: 0, pending: true });
      }
      throw e;
    }

    const followersCount = await followerCount(providerId);
    return Response.json({ following: false, followersCount });
  } catch (e) {
    console.error("[DELETE /api/providers/[id]/follow] Error:", e?.message);
    return Response.json({ error: "Failed to unfollow provider" }, { status: 500 });
  }
}

// PP3: the WRITE handlers are additionally wrapped with withRateLimit (utils/rateLimit)
// — a shared, DB-backed fixed-window counter. Reads are never limited.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(withRateLimit("follow_toggle", POST));
const wrappedDELETE = withRequestContext(withRateLimit("follow_toggle", DELETE));
export { wrappedGET as GET, wrappedPOST as POST, wrappedDELETE as DELETE };
