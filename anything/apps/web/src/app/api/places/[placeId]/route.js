import { auth } from "@/auth";
import { placeDetails } from "@/app/api/utils/places";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/places/[placeId] — full detail for one place (Wave 7 ticket 2.73). Auth-gated; key-gated
// server-side. When the key is unset it returns { configured: false, place: null } (HTTP 200).
async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await placeDetails(params.placeId);
    return Response.json(result);
  } catch (e) {
    console.error("[GET /api/places/[placeId]] Error:", e?.message);
    return Response.json({ error: "Failed to load place" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
