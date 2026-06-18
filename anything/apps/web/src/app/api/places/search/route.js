import { auth } from "@/auth";
import { searchPlaces } from "@/app/api/utils/places";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/places/search?lat&lng&category&radius — nearby pet-friendly places (Wave 7 ticket 2.73).
// Auth-gated. The GOOGLE_PLACES_API_KEY lives server-side only; when unset this returns a clean
// { configured: false, places: [] } (HTTP 200) so the app shows "not set up yet" — never a 500.
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const latRaw = searchParams.get("lat");
    const lngRaw = searchParams.get("lng");
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    const category = searchParams.get("category") || "park";
    const radius = Number(searchParams.get("radius")) || 5000;

    if (!latRaw || !lngRaw || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json(
        { error: "lat and lng are required" },
        { status: 400 },
      );
    }
    const result = await searchPlaces({ lat, lng, category, radius });
    return Response.json(result);
  } catch (e) {
    console.error("[GET /api/places/search] Error:", e?.message);
    return Response.json({ error: "Failed to search places" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
