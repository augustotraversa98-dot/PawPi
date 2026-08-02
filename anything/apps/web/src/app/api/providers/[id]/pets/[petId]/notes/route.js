import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { assertCareAccess, CareAccessError } from "@/app/api/utils/careAccess";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/providers/[id]/pets/[petId]/notes — provider staff write a vet note
// back to the pet's record. Ticket 8 (docs/provider-design.md §4 item 8).
//
// Authorization is SOLELY assertCareAccess (scope 'medical_write'): active
// membership + active grant, and it writes the audit row. No requireProviderRole;
// no self-written audit row. owner_user_id is derived from pets.owner_user_id so
// the note lands on the owner's record and is immediately visible to them.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every
// query is a tagged template; params bind via `${}`.
async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const petId = params.petId;

    const staffUserId = await resolveUserId(session.user.id);
    if (staffUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = (await request.json()) ?? {};
    const { note, note_date, vet_name, appointment_id } = body;

    if (!note) {
      return Response.json({ error: "note is required" }, { status: 400 });
    }

    // The ONLY gate. Throws CareAccessError(403) on denial; writes the audit row.
    await assertCareAccess(petId, providerId, "medical_write", {
      staffUserId,
      action: "write",
      resource: "vet_notes",
    });

    // Derive the note's owner from the pet — the note belongs to the pet owner's
    // record, not to the acting staff member.
    const petRows = await sql`
      SELECT owner_user_id FROM pets WHERE id = ${petId}
    `;
    if (petRows.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }
    const ownerUserId = petRows[0].owner_user_id;

    // vet_name defaults to the acting provider/staff display name. It must NEVER
    // end up null: a vet note with no attribution renders on the owner's record as
    // "You" (indistinguishable from an owner-authored note). So the chain falls
    // through to the acting user's email and finally a neutral "Veterinario" — the
    // note always names who wrote it. (No schema change; vet_notes still has only
    // the denormalized vet_name text — a structured author FK stays a proposal.)
    let resolvedVetName = vet_name ?? null;
    if (!resolvedVetName) {
      const nameRows = await sql`
        SELECT pr.name AS provider_name, up.full_name AS staff_name, up.username AS staff_username
        FROM providers pr
        LEFT JOIN user_profiles up ON up.id = ${staffUserId}
        WHERE pr.id = ${providerId}
      `;
      const n = nameRows[0] ?? {};
      resolvedVetName =
        n.staff_name ||
        n.staff_username ||
        n.provider_name ||
        session.user.email ||
        "Veterinario";
    }

    // note_date defaults to today (canonical YYYY-MM-DD).
    const resolvedNoteDate = note_date ?? new Date().toISOString().slice(0, 10);

    const created = await sql`
      INSERT INTO vet_notes (
        pet_id, owner_user_id, vet_name, note_date, note, appointment_id
      ) VALUES (
        ${petId}, ${ownerUserId}, ${resolvedVetName}, ${resolvedNoteDate}, ${note}, ${appointment_id ?? null}
      )
      RETURNING *
    `;

    return Response.json({ note: created[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof CareAccessError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[POST /api/providers/[id]/pets/[petId]/notes] Error:",
      e?.message,
    );
    return Response.json({ error: "Failed to create note" }, { status: 500 });
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
