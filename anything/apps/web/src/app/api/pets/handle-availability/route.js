import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/pets/handle-availability?handle=xxx
//
// Live handle-uniqueness check for onboarding step 2 (a taken handle used to only
// surface at the final "Create profile" step, forcing a backtrack — SIMULATOR_QA
// finding #6). Reuses the exact same `pets.handle` lookup POST /api/pets already
// runs before insert, just exposed as a cheap read so the client can ask before
// the rest of the form is filled in. POST /api/pets stays the authoritative
// backstop — a same-handle race is still caught there by the `pets_handle_key`
// unique constraint.
//
// pets' SELECT policy (0021, pets_authed_read) is any-signed-in-user, not
// owner-scoped, so this sees every pet's handle once withRequestContext stamps
// the caller's identity — same as the POST route's existing check.
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const handle = (searchParams.get("handle") || "")
      .toLowerCase()
      .trim()
      .replace(/^@+/, "");

    if (!handle) {
      return Response.json({ error: "Missing handle" }, { status: 400 });
    }

    const existing = await sql`
      SELECT id FROM pets WHERE handle = ${handle} LIMIT 1
    `;

    return Response.json({ available: existing.length === 0 });
  } catch (error) {
    console.error(
      "[GET /api/pets/handle-availability] Error:",
      error.message,
    );
    return Response.json(
      { error: "Failed to check handle availability" },
      { status: 500 },
    );
  }
}

// RLS R1 pilot route: identity-scoped wrapper (docs/rls-hardening.md), same
// pattern as the sibling /api/pets route.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
