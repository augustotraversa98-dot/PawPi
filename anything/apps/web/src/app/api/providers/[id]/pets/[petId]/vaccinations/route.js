import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { assertCareAccess, CareAccessError } from "@/app/api/utils/careAccess";

// POST /api/providers/[id]/pets/[petId]/vaccinations — provider staff write a
// vaccination back to the pet's record. Ticket 8 (docs/provider-design.md §4
// item 8).
//
// Authorization is SOLELY assertCareAccess (scope 'vaccinations_write'): active
// membership + active grant, and it writes the audit row. No requireProviderRole;
// no self-written audit row. owner_user_id is derived from pets.owner_user_id and
// administered_by_provider_id is stamped with this provider, so the owner sees the
// provider-administered vaccination immediately.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager"): every
// query is a tagged template; params bind via `${}`.
export async function POST(request, { params }) {
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
    const { name, date_given, expires_on, lot } = body;

    if (!name) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }

    // The ONLY gate. Throws CareAccessError(403) on denial; writes the audit row.
    await assertCareAccess(petId, providerId, "vaccinations_write", {
      staffUserId,
      action: "write",
      resource: "pet_vaccinations",
    });

    // Derive owner from the pet — the vaccination belongs to the pet owner's
    // record.
    const petRows = await sql`
      SELECT owner_user_id FROM pets WHERE id = ${petId}
    `;
    if (petRows.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }
    const ownerUserId = petRows[0].owner_user_id;

    const created = await sql`
      INSERT INTO pet_vaccinations (
        pet_id, owner_user_id, name, date_given, expires_on, lot, administered_by_provider_id
      ) VALUES (
        ${petId}, ${ownerUserId}, ${name}, ${date_given ?? null}, ${expires_on ?? null}, ${lot ?? null}, ${providerId}
      )
      RETURNING *
    `;

    return Response.json({ vaccination: created[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof CareAccessError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error(
      "[POST /api/providers/[id]/pets/[petId]/vaccinations] Error:",
      e?.message,
    );
    return Response.json(
      { error: "Failed to create vaccination" },
      { status: 500 },
    );
  }
}
