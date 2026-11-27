import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { recordCareAccess } from "@/app/api/utils/careAccess";
import { isRecordId } from "@/app/api/utils/sharedWrites";
import { cleanText } from "@/app/api/utils/cleanText";
import { isMissingSchema } from "@/app/api/utils/recordLink";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";

// PATCH /api/providers/[id]/pets/[petId]/notes/[noteId] { note } → 200 { note }: a business corrects a note it added to
// this pet, while the owner still lets it add notes (migration 0160, app_provider_update_vet_note). Never a note of the
// owner's or of another business. The note is marked as edited.
//   403 no such access · 404 'note_not_found' · 400 · 409 'note_edit_unavailable' (database without 0160)
async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: providerId, petId, noteId } = params;

    const staffUserId = await resolveUserId(session.user.id);
    if (staffUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) ?? {};
    const note = typeof body.note === "string" ? cleanText(body.note).trim() : "";
    if (!note) {
      return Response.json({ error: "note is required" }, { status: 400 });
    }
    const notFound = () =>
      Response.json({ error: "Note not found", code: "note_not_found" }, { status: 404 });
    if (![providerId, petId, noteId].every(isRecordId)) return notFound();

    let rows;
    try {
      rows = await withSavepoint(async () => {
        return await sql`
          SELECT outcome, grant_id, record
          FROM app_provider_update_vet_note(${petId}::int, ${providerId}::int, ${noteId}::int, ${note})
        `;
      });
    } catch (error) {
      if (!isMissingSchema(error)) throw error;
      return Response.json(
        { error: "Notes cannot be edited yet", code: "note_edit_unavailable" },
        { status: 409 },
      );
    }
    const result = rows?.[0];
    if (result?.outcome === "updated" || result?.outcome === "unchanged") {
      if (result.outcome === "updated") {
        await recordCareAccess(result.grant_id, staffUserId, "write", `vet_notes:${noteId}`);
      }
      return Response.json({ note: result.record });
    }
    if (result?.outcome === "not_found") return notFound();
    if (result?.outcome === "bad_note") {
      return Response.json({ error: "The note is empty or too long" }, { status: 400 });
    }
    return Response.json({ error: "No active care-access grant for the required scope" }, { status: 403 });
  } catch (error) {
    console.error("[PATCH /api/providers/[id]/pets/[petId]/notes/[noteId]] Error:", error?.message);
    return Response.json({ error: "Failed to change the note" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
