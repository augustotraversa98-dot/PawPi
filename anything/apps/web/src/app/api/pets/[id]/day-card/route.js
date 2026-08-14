import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";

// GET /api/pets/[id]/day-card?day=<YYYY-MM-DD>
//
// The multi-caregiver "day card" (unit E13 PR2) — a pet's daily moments for one day, grouped as ONE card
// with per-author slides (a horizontal carousel). Each caregiver may add one moment/day (posts route
// cap); this endpoint returns them attributed to their authors, newest contribution last, plus the
// day-card-level paw/bark totals and `latest_contribution_at` (the feed bumps the card to the top when a
// new caregiver contributes). Owner OR active caregiver only.

const UNDEFINED_TABLE = "42P01";
const UNDEFINED_FUNCTION = "42883";
const isMissingSchema = (e) => e?.code === UNDEFINED_TABLE || e?.code === UNDEFINED_FUNCTION;
const isIntId = (v) => /^\d+$/.test(String(v));
const isDayStr = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ""));
const toDayStr = (v) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v).slice(0, 10);

async function requirePetAccess(session, petIdRaw) {
  if (!session?.user?.id) return { error: "Unauthorized", status: 401 };
  if (!isIntId(petIdRaw)) return { error: "Pet not found", status: 404 };
  const callerId = await resolveUserId(session.user.id);
  if (callerId === null) return { error: "User profile not found", status: 404 };
  const petId = parseInt(petIdRaw, 10);
  const owned = await sql`SELECT 1 FROM pets WHERE id = ${petId} AND owner_user_id = ${callerId} LIMIT 1`;
  if (owned.length > 0) return { petId };
  let hasAccess = false;
  try {
    await withSavepoint(async () => {
      const [r] = await sql`SELECT app_user_has_pet_access(${petId}) AS ok`;
      hasAccess = !!r?.ok;
    });
  } catch (e) {
    if (!isMissingSchema(e)) throw e;
  }
  if (!hasAccess) return { error: "Pet not found", status: 404 };
  return { petId };
}

async function GET(request, { params }) {
  try {
    const session = await auth();
    const gate = await requirePetAccess(session, params.id);
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status });
    const { petId } = gate;

    const { searchParams } = new URL(request.url);
    const day = isDayStr(searchParams.get("day"))
      ? searchParams.get("day")
      : new Date().toISOString().slice(0, 10);

    const [petRow] = await sql`SELECT id, name, handle, avatar_url FROM pets WHERE id = ${petId}`;

    // The day's moments, attributed to their authors (oldest → newest contribution).
    const slideRows = await sql`
      SELECT p.id, p.image_url, p.caption, p.created_at, p.media_type, p.video_url, p.video_thumbnail_url,
             up.id AS author_id, up.username AS author_username, up.avatar_url AS author_avatar,
             (SELECT count(*)::int FROM post_paws pp WHERE pp.post_id = p.id) AS paws,
             (SELECT count(*)::int FROM post_barks pb WHERE pb.post_id = p.id) AS barks
      FROM posts p
      JOIN user_profiles up ON up.id = p.user_id
      WHERE p.pet_id = ${petId} AND p.is_daily_update = true AND p.post_date = ${day}::date
      ORDER BY p.created_at ASC, p.id ASC
    `;

    const slides = slideRows.map((r) => ({
      post_id: r.id,
      image_url: r.image_url,
      caption: r.caption,
      media_type: r.media_type,
      video_url: r.video_url,
      video_thumbnail_url: r.video_thumbnail_url,
      created_at: r.created_at,
      author: { id: r.author_id, username: r.author_username, avatar_url: r.author_avatar },
      paws: r.paws,
      barks: r.barks,
    }));

    // Day-card-level totals + the bump anchor.
    const pawTotal = slides.reduce((n, s) => n + (s.paws || 0), 0);
    const barkTotal = slides.reduce((n, s) => n + (s.barks || 0), 0);
    const latest = slides.length ? slides[slides.length - 1].created_at : null;
    const authorCount = new Set(slides.map((s) => s.author.id)).size;

    return Response.json({
      day,
      pet: petRow
        ? { id: petRow.id, name: petRow.name, handle: petRow.handle, avatar_url: petRow.avatar_url }
        : { id: petId },
      slides,
      author_count: authorCount,
      paw_count: pawTotal,
      bark_count: barkTotal,
      latest_contribution_at: latest,
    });
  } catch (error) {
    console.error("[GET /api/pets/[id]/day-card] ERROR:", error.message);
    return Response.json({ error: "Failed to load day card" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
