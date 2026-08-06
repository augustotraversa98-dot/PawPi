import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { searchPlacesInDb, num } from "@/app/api/utils/placesQuery";

// GET /api/places/search?lat&lng&category&radius — the LEGACY nearby-places path, now served from
// the PawPi-owned places catalog (0075) instead of the Google Places proxy. Kept alive so the
// existing mobile client (usePlacesSearch) keeps working unchanged against real data until the
// mobile step migrates it to GET /api/places. lat/lng are required (a geo-nearby search); results
// carry distance_km and are nearest-first. `configured: true` is retained for client compatibility.
//
// Each row also exposes `place_id` (= id) so the existing "save this place" flow (POST
// /api/saved-places, which keys on place_id) keeps functioning; saved-places reconciliation to the
// new ids happens in the mobile step.
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const lat = num(searchParams.get("lat"));
    const lng = num(searchParams.get("lng"));
    if (lat === null || lng === null) {
      return Response.json({ error: "lat and lng are required" }, { status: 400 });
    }
    const category = searchParams.get("category") || null;
    const rows = await searchPlacesInDb({
      category,
      lat,
      lng,
      radiusKm: num(searchParams.get("radius")),
    });
    const places = rows.map((r) => ({ ...r, place_id: r.id }));
    return Response.json({ configured: true, category, places });
  } catch (e) {
    console.error("[GET /api/places/search] Error:", e?.message);
    return Response.json({ error: "Failed to search places" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
