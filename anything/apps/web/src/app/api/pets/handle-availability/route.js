import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { withRateLimit } from "@/app/api/utils/rateLimit";
import {
  normalizeHandle,
  handleFormatCode,
  takenAmong,
  alternativesFor,
} from "@/app/api/utils/petHandle";

// GET /api/pets/handle-availability?handle=xxx[&pet_id=123]
//
// Live handle-uniqueness check for onboarding step 2, add-another-dog and profile edit.
// Response (additive — build 26 only reads `available`):
//   { available: true }
//   { available: false, valid: false, reason }          — format/reserved problem (no DB hit)
//   { available: false, alternatives: ["rex2", ...] }   — taken; up to 3 FREE suggestions
// It reveals ONLY available/taken — never whose handle it is, nor any pet/owner data.
//
// Comparison is case-insensitive and ignores a leading "@" (normalizeHandle).
// `pet_id` is for editing: the caller's OWN pet's current handle counts as available (the id is
// honoured only when that pet is owned by the caller, so it can't be used to probe others).
//
// pets' SELECT policy (0021, pets_authed_read) is any-signed-in-user, not owner-scoped, so this
// sees every pet's handle once withRequestContext stamps the caller's identity. POST/PATCH stay
// the authoritative backstop — a same-handle race is caught there (unique constraint → 409).
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const handle = normalizeHandle(searchParams.get("handle"));

    if (!handle) {
      return Response.json({ error: "Missing handle" }, { status: 400 });
    }

    const reason = handleFormatCode(handle);
    if (reason) {
      return Response.json({ available: false, valid: false, reason });
    }

    const rawPetId = parseInt(searchParams.get("pet_id") || "", 10);
    const ownPetId = Number.isFinite(rawPetId) ? rawPetId : -1;

    const existing = await sql`
      SELECT id FROM pets
      WHERE lower(handle) = ${handle}
        AND NOT (id = ${ownPetId} AND owner_user_id = current_app_user_id())
      LIMIT 1
    `;

    if (existing.length === 0) {
      return Response.json({ available: true });
    }

    let alternatives = [];
    try {
      alternatives = (await alternativesFor(sql, handle, 3)) || [];
    } catch {
      alternatives = [];
    }
    return Response.json({ available: false, alternatives });
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

// RLS R1 pilot route: identity-scoped wrapper (docs/rls-hardening.md); rate limited
// (`handle_check`) so the endpoint can't be used to enumerate handles.
const wrappedGET = withRequestContext(withRateLimit("handle_check", GET));
export { wrappedGET as GET };
