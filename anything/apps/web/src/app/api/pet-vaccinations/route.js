import sql from "@/app/api/utils/sql";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { presentSharedRow } from "@/app/api/utils/sharedWrites";

// GET /api/pet-vaccinations?petId=... — OWNER-side read of a pet's vaccinations.
// Ticket 8 (docs/provider-design.md §4 item 8). This is the owner half that makes
// provider-written vaccinations immediately visible to the owner (vet_notes
// already has an owner GET; pet_vaccinations was missing one).
//
// OWNER-context route: authorization is pet ownership via the existing
// `WHERE owner_user_id = me` pattern — NOT assertCareAccess (that gates the
// provider side only). DB is porsager's tagged-template `sql`.
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const petId = searchParams.get("petId");
    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    const ownerUserId = await resolveUserId(session.user.id);
    if (ownerUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const vaccinations = await sql`
      SELECT v.*, COALESCE(NULLIF(BTRIM(up.full_name), ''), CASE WHEN v.created_by_role = 'editor' AND v.created_by_user_id IS NULL THEN 'Former member' END) AS created_by_name,
        ap.name AS added_by_provider_name, o.preferred_locale AS owner_locale
      FROM pet_vaccinations v
      LEFT JOIN user_profiles up ON up.id = v.created_by_user_id
      LEFT JOIN user_profiles o ON o.id = v.owner_user_id
      LEFT JOIN providers ap ON ap.id = (to_jsonb(v) ->> 'added_by_provider_id')::int
      WHERE v.pet_id = ${petId}
        AND v.owner_user_id = (
          SELECT p.owner_user_id FROM pets p
          WHERE p.id = ${petId} AND (p.owner_user_id = ${ownerUserId} OR app_user_has_pet_family(p.id))
        )
        AND v.deleted_at IS NULL
      ORDER BY v.date_given DESC NULLS LAST, v.created_at DESC
    `;

    return Response.json({ vaccinations: vaccinations.map(presentSharedRow) });
  } catch (error) {
    console.error("[GET /api/pet-vaccinations] Error:", error?.message);
    return Response.json(
      { error: "Failed to fetch vaccinations" },
      { status: 500 },
    );
  }
}

// Owner creates a vaccination for their own pet (NR4 — the Vaccines tab). Ownership is
// the pet's owner_user_id = the caller; the row's own-row (0022 owner-private) RLS also
// enforces it. clinic_name / notes / reminder_enabled are the 0117 additive columns.
async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const ownerUserId = await resolveUserId(session.user.id);
    if (ownerUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = await request.json();
    const { petId, name, dateGiven, expiresOn, clinicName, notes, reminderEnabled } = body;
    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }
    if (!name || !name.trim()) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }

    // The pet's OWNER or an active FAMILY grantee (co-owner) may add this (owner decision 2, PR3b). Family needs the pet_vaccinations_family_all
    // policy (0141) — absent => friendly 403. The row is anchored to the pet's OWNER.
    const access = await resolvePetLogOwner(ownerUserId, petId, {
      familyPolicy: { table: "pet_vaccinations", policy: "pet_vaccinations_family_all" },
    });
    if (access.error) {
      return access.code
        ? Response.json({ error: access.error, code: access.code }, { status: access.status })
        : Response.json({ error: "Pet not found" }, { status: 404 });
    }

    const rows = await sql`
      INSERT INTO pet_vaccinations
        (pet_id, owner_user_id, name, date_given, expires_on, clinic_name, notes, reminder_enabled,
         created_by_user_id, created_by_role)
      VALUES (
        ${petId}, ${access.ownerUserId}, ${name.trim()},
        ${dateGiven || null}, ${expiresOn || null},
        ${clinicName || null}, ${notes || null}, ${reminderEnabled || false},
        ${ownerUserId}, ${access.isOwner ? 'owner' : 'editor'}
      )
      RETURNING *
    `;
    return Response.json({ vaccination: rows[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/pet-vaccinations] Error:", error?.message);
    return Response.json({ error: "Failed to create vaccination" }, { status: 500 });
  }
}

// Owner edits one of their own vaccinations (only provided fields change).
async function PATCH(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const ownerUserId = await resolveUserId(session.user.id);
    if (ownerUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = await request.json();
    const { id, name, dateGiven, expiresOn, clinicName, notes, reminderEnabled } = body;
    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const rows = await sql`
      UPDATE pet_vaccinations SET
        name             = COALESCE(${name ?? null}, name),
        date_given       = ${dateGiven !== undefined ? dateGiven || null : sql`date_given`},
        expires_on       = ${expiresOn !== undefined ? expiresOn || null : sql`expires_on`},
        clinic_name      = ${clinicName !== undefined ? clinicName || null : sql`clinic_name`},
        notes            = ${notes !== undefined ? notes || null : sql`notes`},
        reminder_enabled = COALESCE(${reminderEnabled ?? null}, reminder_enabled),
        updated_at       = now()
      WHERE id = ${id} AND (owner_user_id = ${ownerUserId} OR app_user_has_pet_family(pet_id)) AND deleted_at IS NULL
      RETURNING *
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Vaccination not found" }, { status: 404 });
    }
    return Response.json({ vaccination: rows[0] });
  } catch (error) {
    console.error("[PATCH /api/pet-vaccinations] Error:", error?.message);
    return Response.json({ error: "Failed to update vaccination" }, { status: 500 });
  }
}

// Owner soft-deletes one of their own vaccinations.
async function DELETE(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const ownerUserId = await resolveUserId(session.user.id);
    if (ownerUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const rows = await sql`
      UPDATE pet_vaccinations SET deleted_at = now()
      WHERE id = ${parseInt(id)} AND (owner_user_id = ${ownerUserId} OR app_user_has_pet_family(pet_id)) AND deleted_at IS NULL
      RETURNING id
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Vaccination not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/pet-vaccinations] Error:", error?.message);
    return Response.json({ error: "Failed to delete vaccination" }, { status: 500 });
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
const wrappedPATCH = withRequestContext(PATCH);
const wrappedDELETE = withRequestContext(DELETE);
export {
  wrappedGET as GET,
  wrappedPOST as POST,
  wrappedPATCH as PATCH,
  wrappedDELETE as DELETE,
};
