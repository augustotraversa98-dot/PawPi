import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { withRateLimit } from "@/app/api/utils/rateLimit";
import {
  handleCandidates,
  findFreeHandles,
  takenAmong,
} from "@/app/api/utils/petHandle";

// GET /api/pets/handle-suggestions?name=Luna[&breed=Beagle]
//
// Free handles generated from the pet's name, guaranteed available AT SUGGESTION TIME (a race is
// still caught on save). Deterministic variants in order: name, name+owner initial, name+breed,
// name+".paws", name+2…; reserved words and invalid shapes are skipped.
//   { default: "luna", suggestions: ["luna", "lunam", ...] }   (up to 5, `default` = first)
// The owner initial comes from the caller's own profile name — never from an e-mail address.
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const name = (searchParams.get("name") || "").slice(0, 60);
    const breed = (searchParams.get("breed") || "").slice(0, 60);
    if (!name.trim()) {
      return Response.json({ error: "Missing name" }, { status: 400 });
    }

    let ownerInitial = "";
    try {
      const rows = await sql`
        SELECT full_name FROM user_profiles WHERE id = current_app_user_id() LIMIT 1
      `;
      ownerInitial = String(rows?.[0]?.full_name || "").trim().charAt(0);
    } catch {
      ownerInitial = "";
    }

    const suggestions = await findFreeHandles(
      handleCandidates({ name, breed, ownerInitial }),
      (chunk) => takenAmong(sql, chunk),
      5,
    );
    return Response.json({ default: suggestions[0] ?? null, suggestions });
  } catch (error) {
    console.error("[GET /api/pets/handle-suggestions] Error:", error.message);
    return Response.json(
      { error: "Failed to suggest handles" },
      { status: 500 },
    );
  }
}

const wrappedGET = withRequestContext(withRateLimit("handle_check", GET));
export { wrappedGET as GET };
