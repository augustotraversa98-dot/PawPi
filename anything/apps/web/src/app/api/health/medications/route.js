import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// NR4 — owner-scoped CRUD for a pet's medications (pet_medications, 0117). Own-row RLS
// (owner_user_id = current_app_user_id()) enforces isolation; every handler also filters
// WHERE owner_user_id = the caller, so a user can never read/write another owner's meds.

async function GET(request) {
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
    const petId = searchParams.get("petId");
    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    const medications = await sql`
      SELECT m.*, coalesce(up.full_name, up.username) AS created_by_name
      FROM pet_medications m
      LEFT JOIN user_profiles up ON up.id = m.created_by_user_id
      WHERE m.pet_id = ${parseInt(petId)}
        AND m.owner_user_id = ${ownerUserId}
        AND m.deleted_at IS NULL
      ORDER BY (m.status = 'active') DESC, m.created_at DESC
    `;
    return Response.json({ medications });
  } catch (error) {
    console.error("[GET /api/health/medications] Error:", error?.message);
    return Response.json({ error: "Failed to fetch medications" }, { status: 500 });
  }
}

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
    const { petId, name, dose, frequency, prescribedBy, notes, startDate, reminderEnabled } = body;
    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }
    if (!name || !name.trim()) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }

    const owned = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${ownerUserId}
    `;
    if (owned.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }

    const rows = await sql`
      INSERT INTO pet_medications
        (pet_id, owner_user_id, name, dose, frequency, prescribed_by, notes, start_date, reminder_enabled,
         created_by_user_id, created_by_role)
      VALUES (
        ${petId}, ${ownerUserId}, ${name.trim()},
        ${dose || null}, ${frequency || null}, ${prescribedBy || null},
        ${notes || null}, ${startDate || null}, ${reminderEnabled || false},
        ${ownerUserId}, 'owner'
      )
      RETURNING *
    `;
    return Response.json({ medication: rows[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/health/medications] Error:", error?.message);
    return Response.json({ error: "Failed to create medication" }, { status: 500 });
  }
}

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
    const { id, name, dose, frequency, prescribedBy, notes, startDate, endDate, status, reminderEnabled } = body;
    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }
    if (status !== undefined && !["active", "completed"].includes(status)) {
      return Response.json({ error: "status must be active or completed" }, { status: 400 });
    }

    // Completing a med stamps its end_date (today) unless one was passed.
    const resolvedEndDate =
      endDate !== undefined
        ? endDate || null
        : status === "completed"
          ? new Date().toISOString().slice(0, 10)
          : undefined;

    const rows = await sql`
      UPDATE pet_medications SET
        name             = COALESCE(${name ?? null}, name),
        dose             = ${dose !== undefined ? dose || null : sql`dose`},
        frequency        = ${frequency !== undefined ? frequency || null : sql`frequency`},
        prescribed_by    = ${prescribedBy !== undefined ? prescribedBy || null : sql`prescribed_by`},
        notes            = ${notes !== undefined ? notes || null : sql`notes`},
        start_date       = ${startDate !== undefined ? startDate || null : sql`start_date`},
        end_date         = ${resolvedEndDate !== undefined ? resolvedEndDate : sql`end_date`},
        status           = COALESCE(${status ?? null}, status),
        reminder_enabled = COALESCE(${reminderEnabled ?? null}, reminder_enabled),
        updated_at       = now()
      WHERE id = ${id} AND owner_user_id = ${ownerUserId} AND deleted_at IS NULL
      RETURNING *
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Medication not found" }, { status: 404 });
    }
    return Response.json({ medication: rows[0] });
  } catch (error) {
    console.error("[PATCH /api/health/medications] Error:", error?.message);
    return Response.json({ error: "Failed to update medication" }, { status: 500 });
  }
}

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
      UPDATE pet_medications SET deleted_at = now()
      WHERE id = ${parseInt(id)} AND owner_user_id = ${ownerUserId} AND deleted_at IS NULL
      RETURNING id
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Medication not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/health/medications] Error:", error?.message);
    return Response.json({ error: "Failed to delete medication" }, { status: 500 });
  }
}

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
