import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { enforceRateLimit } from "@/app/api/utils/rateLimit";
import { isMissingSchema } from "@/app/api/utils/shareOffers";

// GET /api/care-access/vets?q= → { available, vets: [{ id, name, handle, logo_url, location_name, address }] }: the vet
// businesses an owner can invite to see a record (migration 0154). Matches part of the business name or handle, or the
// owning account's username typed in full; answers public business fields only. Only published, non-demo businesses with
// the vet capability that have an account able to receive the invitation (app_vet_can_receive_share). Under two
// characters: no results.
// `available` is false on a database without 0154. Rate limited like the other searches.
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const limited = await enforceRateLimit("search_query", request, { userId });
    if (limited) return limited;

    // The database's text cannot hold the NUL character, so it is left out of the search.
    const q = (new URL(request.url).searchParams.get("q") ?? "").replaceAll("\u0000", "").trim().slice(0, 60);

    let vets;
    try {
      vets = await withSavepoint(async () => {
        return await sql`
          SELECT id, name, handle, logo_url, location_name, address
          FROM app_search_share_vets(${q})
        `;
      });
    } catch (error) {
      if (!isMissingSchema(error)) throw error;
      return Response.json({ available: false, vets: [] });
    }

    return Response.json({ available: true, vets });
  } catch (error) {
    console.error("[GET /api/care-access/vets] Error:", error.message);
    return Response.json({ error: "Failed to search vets" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
