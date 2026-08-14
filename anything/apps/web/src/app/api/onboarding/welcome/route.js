import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";

// POST /api/onboarding/welcome — the E6 "ring started" payoff (docs/pet-owner-engagement.md).
//
// Called once, right after the new owner's FIRST daily moment is posted. It does two honest things:
//   • Starts the streak at day 1 (a real care action happened today — the first moment). Seeds
//     pet_streaks only when the pet has no streak yet (ON CONFLICT DO NOTHING) so it can never
//     overwrite a real streak; the E2 helper takes over from the next ring close.
//   • Grants the ONE allowed, labelled seeded interaction: a first paw from the official "PawPi
//     Welcome" account via the app_welcome_paw DEFINER helper (migration 0096), which also files a
//     clearly-labelled 'welcome' notification.
//
// Body: { post_id, pet_id }. The post must belong to the caller's pet. Everything is scoped to the
// owner (owner_user_id = user_profiles.id). DEGRADES CLEANLY pre-migration: a missing 0096 helper
// (42883) or a missing streak table (42P01) returns { welcomed:false, degraded:true } — never a 500,
// so onboarding always finishes.

const UNDEFINED_TABLE = "42P01";
const UNDEFINED_FUNCTION = "42883";
const isMissingSchema = (e) => e?.code === UNDEFINED_TABLE || e?.code === UNDEFINED_FUNCTION;
const isIntId = (v) => Number.isInteger(v) || /^\d+$/.test(String(v ?? ""));

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const ownerUserId = await resolveUserId(session.user.id);
    if (ownerUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) ?? {};
    if (!isIntId(body.post_id) || !isIntId(body.pet_id)) {
      return Response.json({ error: "post_id and pet_id are required" }, { status: 400 });
    }
    const postId = parseInt(body.post_id, 10);
    const petId = parseInt(body.pet_id, 10);

    // The post must be the caller's own, on the caller's own pet.
    const owned = await sql`
      SELECT 1 FROM posts
      WHERE id = ${postId} AND user_id = ${ownerUserId} AND pet_id = ${petId}
      LIMIT 1
    `;
    if (owned.length === 0) {
      return Response.json({ error: "Post not found" }, { status: 404 });
    }

    // Owner-timezone "today" for the day-1 streak boundary.
    const [prof] = await sql`
      SELECT (now() AT TIME ZONE COALESCE(timezone, 'America/Buenos_Aires'))::date AS today
      FROM user_profiles WHERE id = ${ownerUserId}
    `;
    const today = prof?.today;

    let streakStarted = false;
    let welcomed = false;

    // 1) Start the streak at day 1 (only if absent). Owner-scoped write under the pet_streaks
    //    own-row RLS (0094) — no DEFINER needed.
    try {
      await withSavepoint(async () => {
        await sql`
          INSERT INTO pet_streaks
            (pet_id, owner_user_id, current_count, longest_count, last_closed_day, updated_at)
          VALUES (${petId}, ${ownerUserId}, 1, 1, ${today}::date, now())
          ON CONFLICT (pet_id) DO NOTHING
        `;
        streakStarted = true;
      });
    } catch (e) {
      if (!isMissingSchema(e)) throw e;
    }

    // 2) The official welcome paw + labelled notification (DEFINER helper, migration 0096).
    try {
      await withSavepoint(async () => {
        await sql`SELECT app_welcome_paw(${postId})`;
        welcomed = true;
      });
    } catch (e) {
      if (!isMissingSchema(e)) throw e;
    }

    return Response.json({
      welcomed,
      degraded: !welcomed || !streakStarted,
      welcome_actor: "pawpi_welcome",
      streak: streakStarted ? { current_count: 1 } : null,
    });
  } catch (error) {
    console.error("[POST /api/onboarding/welcome] ERROR:", error.message);
    return Response.json({ error: "Failed to start the ring" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
