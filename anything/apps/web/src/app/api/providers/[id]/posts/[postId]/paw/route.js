import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { bizNotifyBody } from "@/app/api/utils/notify";
import { notifyProviderTeam } from "@/app/api/utils/providerNotify";

// "Paws" (likes) on one provider STOREFRONT post (ticket 2.94, migration 0085). Mirrors the pet-feed
// paw (posts/[id]/paw) but keyed on (providerId, postId).
//   POST   — auth required; the signed-in user paws the post. Idempotent (a second paw is a no-op,
//            NOT a toggle — the mobile double-tap always paws). Returns { paw_count, is_pawed:true }.
//   DELETE — auth required; removes the caller's own paw. Returns { paw_count, is_pawed:false }.
//
// Lives under posts/[postId]/ as a static "paw" segment (no [param] sibling), so no static-vs-param
// routing collision. The URL-level tests prove routing through the real Hono router regardless.
//
// DEGRADE-CLEAN pre-migration (0085 is hand-applied AFTER this deploys): every provider_post_paws
// query catches Postgres undefined_table (42P01) and returns the neutral { paw_count:0,
// is_pawed:false } — the paw action no-ops until the table exists. Never a 500, never a crash.

const isIntId = (v) => /^\d+$/.test(String(v));
const UNDEFINED_TABLE = "42P01";
const isMissingTable = (e) => e?.code === UNDEFINED_TABLE;

async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const postId = params.postId;
    if (!isIntId(providerId) || !isIntId(postId)) {
      return Response.json({ error: "Post not found" }, { status: 404 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    // The post must be real + visible (published provider, non-deleted, non-hidden) — a clean 404
    // rather than relying on an RLS-violation path. Same window as comments + the storefront list.
    const post = await sql`
      SELECT 1
      FROM provider_posts pp
      JOIN providers p ON p.id = pp.provider_id
      WHERE pp.id = ${postId}
        AND pp.provider_id = ${providerId}
        AND pp.deleted_at IS NULL
        AND pp.hidden_at IS NULL
        AND p.status = 'published'
      LIMIT 1
    `;
    if (post.length === 0) {
      return Response.json({ error: "Post not found" }, { status: 404 });
    }

    try {
      // Idempotent paw: a repeat is a no-op (unique(post_id, user_id) also backstops this).
      const inserted = await sql`
        INSERT INTO provider_post_paws (post_id, user_id)
        VALUES (${postId}, ${userId})
        ON CONFLICT (post_id, user_id) DO NOTHING
        RETURNING id
      `;
      const countRows = await sql`
        SELECT COUNT(*)::int AS count FROM provider_post_paws WHERE post_id = ${postId}
      `;
      // ENGAGEMENT NOTIFICATION (BN2 biz_post_engagement, IN_APP_ONLY — bell, never push).
      // Only on a NEW paw (no row back on a repeat), so double-taps don't re-notify. Owner +
      // active staff; actor = the user who pawed (never self-notifies).
      if (inserted?.length > 0) {
        await notifyProviderTeam({
          providerId,
          actor: userId,
          type: "biz_post_engagement",
          subjectRef: postId,
          body: bizNotifyBody({ kind: "paw", post_id: Number(postId) }),
        });
      }
      return Response.json({
        success: true,
        paw_count: countRows[0].count,
        is_pawed: true,
      });
    } catch (e) {
      if (!isMissingTable(e)) throw e;
      // Pre-migration: table absent → the paw no-ops, reported as the neutral zero state.
      return Response.json({ success: true, paw_count: 0, is_pawed: false });
    }
  } catch (error) {
    console.error(
      "[POST /api/providers/[id]/posts/[postId]/paw] Error:",
      error.message,
    );
    return Response.json({ error: "Failed to add paw" }, { status: 500 });
  }
}

async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const postId = params.postId;
    if (!isIntId(providerId) || !isIntId(postId)) {
      return Response.json({ error: "Post not found" }, { status: 404 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    try {
      // Remove only the caller's own paw (RLS owner-write also gates this).
      await sql`
        DELETE FROM provider_post_paws
        WHERE post_id = ${postId} AND user_id = ${userId}
      `;
      const countRows = await sql`
        SELECT COUNT(*)::int AS count FROM provider_post_paws WHERE post_id = ${postId}
      `;
      return Response.json({
        success: true,
        paw_count: countRows[0].count,
        is_pawed: false,
      });
    } catch (e) {
      if (!isMissingTable(e)) throw e;
      return Response.json({ success: true, paw_count: 0, is_pawed: false });
    }
  } catch (error) {
    console.error(
      "[DELETE /api/providers/[id]/posts/[postId]/paw] Error:",
      error.message,
    );
    return Response.json({ error: "Failed to remove paw" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedPOST as POST, wrappedDELETE as DELETE };
