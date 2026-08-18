import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// NR4 — owner-scoped CRUD for a pet's preventive treatments (pet_preventive_treatments,
// 0117): flea/tick/heartworm prevention, dewormers, supplements. Own-row RLS enforces
// isolation; every handler also filters WHERE owner_user_id = the caller.

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

    const treatments = await sql`
      SELECT * FROM pet_preventive_treatments
      WHERE pet_id = ${parseInt(petId)}
        AND owner_user_id = ${ownerUserId}
        AND deleted_at IS NULL
      ORDER BY next_due ASC NULLS LAST, created_at DESC
    `;
    return Response.json({ treatments });
  } catch (error) {
    console.error("[GET /api/health/preventive-treatments] Error:", error?.message);
    return Response.json({ error: "Failed to fetch preventive treatments" }, { status: 500 });
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
    const { petId, productName, treatmentType, frequency, lastGiven, nextDue, notes, reminderEnabled } = body;
    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }
    if (!productName || !productName.trim()) {
      return Response.json({ error: "productName is required" }, { status: 400 });
    }

    const owned = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${ownerUserId}
    `;
    if (owned.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }

    const rows = await sql`
      INSERT INTO pet_preventive_treatments
        (pet_id, owner_user_id, product_name, treatment_type, frequency, last_given, next_due, notes, reminder_enabled)
      VALUES (
        ${petId}, ${ownerUserId}, ${productName.trim()},
        ${treatmentType || null}, ${frequency || null},
        ${lastGiven || null}, ${nextDue || null}, ${notes || null}, ${reminderEnabled || false}
      )
      RETURNING *
    `;
    return Response.json({ treatment: rows[0] }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/health/preventive-treatments] Error:", error?.message);
    return Response.json({ error: "Failed to create preventive treatment" }, { status: 500 });
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
    const { id, productName, treatmentType, frequency, lastGiven, nextDue, notes, reminderEnabled } = body;
    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const rows = await sql`
      UPDATE pet_preventive_treatments SET
        product_name     = COALESCE(${productName ?? null}, product_name),
        treatment_type   = ${treatmentType !== undefined ? treatmentType || null : sql`treatment_type`},
        frequency        = ${frequency !== undefined ? frequency || null : sql`frequency`},
        last_given       = ${lastGiven !== undefined ? lastGiven || null : sql`last_given`},
        next_due         = ${nextDue !== undefined ? nextDue || null : sql`next_due`},
        notes            = ${notes !== undefined ? notes || null : sql`notes`},
        reminder_enabled = COALESCE(${reminderEnabled ?? null}, reminder_enabled),
        updated_at       = now()
      WHERE id = ${id} AND owner_user_id = ${ownerUserId} AND deleted_at IS NULL
      RETURNING *
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Preventive treatment not found" }, { status: 404 });
    }
    return Response.json({ treatment: rows[0] });
  } catch (error) {
    console.error("[PATCH /api/health/preventive-treatments] Error:", error?.message);
    return Response.json({ error: "Failed to update preventive treatment" }, { status: 500 });
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
      UPDATE pet_preventive_treatments SET deleted_at = now()
      WHERE id = ${parseInt(id)} AND owner_user_id = ${ownerUserId} AND deleted_at IS NULL
      RETURNING id
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Preventive treatment not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/health/preventive-treatments] Error:", error?.message);
    return Response.json({ error: "Failed to delete preventive treatment" }, { status: 500 });
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
