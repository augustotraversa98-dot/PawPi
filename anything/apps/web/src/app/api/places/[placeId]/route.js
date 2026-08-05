import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { getPlaceById } from "@/app/api/utils/placesQuery";

// GET /api/places/[placeId] — detail for one place from the PawPi-owned catalog (0075), replacing
// the Google Places detail proxy. Auth-gated read of a published, non-deleted row; 404 otherwise.
// The nested reviews route (./reviews) is unchanged and keys off this same id.
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const place = await getPlaceById(params.placeId);
    if (!place) {
      return Response.json({ error: "Place not found" }, { status: 404 });
    }
    return Response.json({ place });
  } catch (e) {
    console.error("[GET /api/places/[placeId]] Error:", e?.message);
    return Response.json({ error: "Failed to load place" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
