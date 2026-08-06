import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { searchPlacesInDb, num } from "@/app/api/utils/placesQuery";

// GET /api/places?q=&category=&neighborhood=&lat=&lng=&radius= — the PawPi-owned pet-friendly places
// directory (0075), the free replacement for the Google Places proxy. Reads OUR places table
// (published, non-deleted). q = ILIKE on name; category/neighborhood are exact filters; when lat/lng
// are given each row gets a distance_km and the list is sorted nearest-first (radius, in km,
// additionally bounds via a bounding box). Auth-gated read; NOT owner-scoped (public directory).
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const places = await searchPlacesInDb({
      q: searchParams.get("q") || null,
      category: searchParams.get("category") || null,
      neighborhood: searchParams.get("neighborhood") || null,
      lat: num(searchParams.get("lat")),
      lng: num(searchParams.get("lng")),
      radiusKm: num(searchParams.get("radius")),
    });

    return Response.json({ places });
  } catch (e) {
    console.error("[GET /api/places] Error:", e?.message);
    return Response.json({ error: "Failed to search places" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
