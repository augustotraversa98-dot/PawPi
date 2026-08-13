import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/feed/milestones?viewerPetId=<id>&day=<YYYY-MM-DD>
//
// Milestone moments for the FEED (unit E3, docs/pet-owner-engagement.md). For the pets that the
// viewer's active pet FOLLOWS, returns any whose birthday (pets.birthday) or gotcha/adoption
// anniversary (pets.adoption_date) falls on `day` (month+day match) — so followers see a celebratory
// event card and can paw/bark the pet's milestone moment. REAL dates only: a pet with no matching
// date simply isn't returned (no fabricated milestone, no placeholder).
//
// Scoping: the viewer must OWN viewerPetId (404 otherwise) — you can only read the follow graph of
// your own pet. `today_post_id` is that pet's daily moment for `day` (for wiring paw/bark), or null.

const isIntId = (v) => /^\d+$/.test(String(v));
const isDayStr = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ""));

// A DATE column comes back as a JS Date (porsager) OR a string — normalize to "YYYY-MM-DD".
const toYMD = (v) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v).slice(0, 10);

// Birthday wins if both fall on the same day; years = anniversary count on `day`.
function milestoneOf(row, day) {
  const [ty, tm, td] = day.split("-").map(Number);
  const match = (dateVal) => {
    const s = toYMD(dateVal);
    if (!s) return null;
    const [y, m, d] = s.split("-").map(Number);
    return m === tm && d === td ? ty - y : null;
  };
  const by = match(row.birthday);
  if (by != null) return { type: "birthday", years: by };
  const ay = match(row.adoption_date);
  if (ay != null) return { type: "gotcha", years: ay };
  return null;
}

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const viewerPetId = searchParams.get("viewerPetId");
    if (!isIntId(viewerPetId)) {
      return Response.json({ error: "Invalid viewerPetId" }, { status: 400 });
    }
    const dayParam = searchParams.get("day");

    const ownerUserId = await resolveUserId(session.user.id);
    if (ownerUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    // The viewer can only read the follow graph of their OWN pet.
    const owned = await sql`
      SELECT 1 FROM pets WHERE id = ${viewerPetId} AND owner_user_id = ${ownerUserId} LIMIT 1
    `;
    if (owned.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }

    // Resolve the day (client-local; fall back to CURRENT_DATE).
    const [{ day }] = isDayStr(dayParam)
      ? [{ day: dayParam }]
      : await sql`SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS day`;

    const rows = await sql`
      SELECT p.id AS pet_id, p.name AS pet_name, p.handle AS pet_handle, p.avatar_url AS pet_avatar,
             p.birthday, p.adoption_date,
             (
               SELECT po.id FROM posts po
               WHERE po.pet_id = p.id AND po.is_daily_update = true AND po.post_date = ${day}::date
               ORDER BY po.created_at DESC LIMIT 1
             ) AS today_post_id
      FROM pet_follows f
      JOIN pets p ON p.id = f.followed_pet_id
      WHERE f.follower_pet_id = ${viewerPetId}
        AND (
          (p.birthday IS NOT NULL AND to_char(p.birthday, 'MM-DD') = to_char(${day}::date, 'MM-DD'))
          OR (p.adoption_date IS NOT NULL AND to_char(p.adoption_date, 'MM-DD') = to_char(${day}::date, 'MM-DD'))
        )
      ORDER BY p.name
    `;

    const milestones = rows
      .map((r) => {
        const m = milestoneOf(r, day);
        if (!m) return null;
        return {
          pet_id: r.pet_id,
          pet_name: r.pet_name,
          pet_handle: r.pet_handle,
          pet_avatar: r.pet_avatar,
          type: m.type,
          years: m.years,
          today_post_id: r.today_post_id ?? null,
        };
      })
      .filter(Boolean);

    return Response.json({ day, milestones });
  } catch (error) {
    console.error("[GET /api/feed/milestones] ERROR:", error.message);
    return Response.json({ error: "Failed to load milestones" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
