import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";

// GET /api/posts/friend-streaks?petIds=1,2,3 — the current streak of the FRIEND dogs among `petIds`.
//
// One request for a whole screen (a feed page, or one dog profile) and one query, kept apart from the feed
// itself so the feed costs no extra database round trip.
//
// Every rule lives in the database function app_friend_streaks (migration 0155): who counts as a friend,
// blocks, the true current streak and the minimum of 7. This route only passes the ids through and returns
// the number: { available: boolean, streaks: [{ pet_id, streak }] }.
//
// DEGRADE CLEANLY: 0155 is hand-applied after this deploys. While the function (or a table it reads) is
// missing the answer is { available: false, streaks: [] } — never a 500.

const MAX_PET_IDS = 100;
const MAX_INT = 2147483647;
const MISSING_SCHEMA = new Set(["42883", "42P01", "42703"]);

// Positive int4 ids only, de-duplicated and capped. Anything else is ignored.
function parsePetIds(raw) {
  const ids = new Set();
  for (const part of String(raw ?? "").split(",")) {
    const text = part.trim();
    if (!/^\d+$/.test(text)) continue;
    const id = Number(text);
    if (id < 1 || id > MAX_INT) continue;
    ids.add(id);
    if (ids.size >= MAX_PET_IDS) break;
  }
  return [...ids];
}

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const petIds = parsePetIds(new URL(request.url).searchParams.get("petIds"));
    if (petIds.length === 0) {
      return Response.json({ available: true, streaks: [] });
    }

    let rows = [];
    try {
      await withSavepoint(async () => {
        rows = await sql`SELECT pet_id, streak FROM app_friend_streaks(${petIds}::int[])`;
      });
    } catch (e) {
      if (!MISSING_SCHEMA.has(e?.code)) throw e;
      return Response.json({ available: false, streaks: [] });
    }

    return Response.json({
      available: true,
      streaks: rows.map((r) => ({ pet_id: r.pet_id, streak: r.streak })),
    });
  } catch (error) {
    console.error("[GET /api/posts/friend-streaks] ERROR:", error.message);
    return Response.json({ error: "Failed to load friend streaks" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
