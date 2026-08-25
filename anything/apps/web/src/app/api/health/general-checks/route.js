import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { resolvePetLogOwner } from "@/app/api/utils/petLogAccess";
import { jsonbWriteValue } from "@/app/api/utils/jsonb";

const UNDEFINED_COLUMN = "42703"; // pre-0118 DB lacks health_general_checks.areas → degrade cleanly

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userProfiles = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;

    if (userProfiles.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const callerId = userProfiles[0].id;

    const body = await request.json();
    const {
      petId,
      eyesStatus,
      earsStatus,
      teethStatus,
      skinFurStatus,
      pawsStatus,
      faceStatus,
      mood,
      energy,
      notes,
      areas,
    } = body;

    // Per-area detail (status + changes[] + notes + photos[]) as a single jsonb blob,
    // keyed by area. Only accept a plain object; anything else is ignored so a bad
    // client payload can't poison the write. The flat *_status columns below are still
    // written alongside, so existing GET consumers are unaffected.
    const areasJson =
      areas && typeof areas === "object" && !Array.isArray(areas) ? areas : null;

    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    // FF2: owner OR accepted FAMILY caregiver may log (0049); the write anchors to the pet's OWNER.
    const access = await resolvePetLogOwner(callerId, petId);
    if (access.error) {
      return Response.json({ error: access.error }, { status: access.status });
    }
    const ownerUserId = access.ownerUserId;

    // Persist the full per-area detail into the additive `areas` jsonb column (0118),
    // keeping the flat status columns populated too. On a pre-0118 DB the `areas`
    // column doesn't exist — that 42703 is isolated in a SAVEPOINT and we retry the
    // insert without it, so the check still saves (minus the richer per-area blob)
    // rather than 500ing during the deploy → migrate window.
    let result = null;
    try {
      await withSavepoint(async () => {
        result = await sql`
          INSERT INTO health_general_checks (
            pet_id, owner_user_id, eyes_status, ears_status, teeth_status,
            skin_fur_status, paws_status, face_status, mood, energy, notes, areas
          ) VALUES (
            ${petId}, ${ownerUserId}, ${eyesStatus || null}, ${earsStatus || null},
            ${teethStatus || null}, ${skinFurStatus || null}, ${pawsStatus || null},
            ${faceStatus || null}, ${mood || null}, ${energy || null}, ${notes || null},
            ${areasJson ? sql.json(jsonbWriteValue(areasJson)) : null}
          )
          RETURNING *
        `;
      });
    } catch (e) {
      if (e?.code !== UNDEFINED_COLUMN) throw e;
      result = null; // fall through to the areas-less insert below
    }

    if (!result) {
      result = await sql`
        INSERT INTO health_general_checks (
          pet_id, owner_user_id, eyes_status, ears_status, teeth_status,
          skin_fur_status, paws_status, face_status, mood, energy, notes
        ) VALUES (
          ${petId}, ${ownerUserId}, ${eyesStatus || null}, ${earsStatus || null},
          ${teethStatus || null}, ${skinFurStatus || null}, ${pawsStatus || null},
          ${faceStatus || null}, ${mood || null}, ${energy || null}, ${notes || null}
        )
        RETURNING *
      `;
    }

    return Response.json({ check: result[0] }, { status: 201 });
  } catch (error) {
    console.error("[health/general-checks] Error creating check:", error);
    return Response.json(
      { error: "Failed to create general check" },
      { status: 500 },
    );
  }
}

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userProfiles = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;

    if (userProfiles.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const ownerUserId = userProfiles[0].id;

    const { searchParams } = new URL(request.url);
    const petId = searchParams.get("petId");
    const limit = parseInt(searchParams.get("limit") || "50");

    let checks;
    if (petId) {
      checks = await sql`
        SELECT * FROM health_general_checks
        WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
        ORDER BY logged_at DESC
        LIMIT ${limit}
      `;
    } else {
      checks = await sql`
        SELECT * FROM health_general_checks
        WHERE owner_user_id = ${ownerUserId}
        ORDER BY logged_at DESC
        LIMIT ${limit}
      `;
    }

    return Response.json({ checks }, { status: 200 });
  } catch (error) {
    console.error("[health/general-checks] Error fetching checks:", error);
    return Response.json(
      { error: "Failed to fetch general checks" },
      { status: 500 },
    );
  }
}

// Delete a single general check the caller owns — the undo path for the Care Ring's
// light Quick Check (the guided check that fills the Care segment). Owner-scoped in the
// WHERE (and enforced again by the table's own-row RLS 0022), so a caller can never delete
// another owner's check. A hard delete of the just-created row, mirroring the wellness-log
// undo: the Care Ring derivation stops counting it the instant the row is gone, so the
// segment re-opens with no dependency on a soft-delete filter in the ring's DB function.
async function DELETE(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userProfiles = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;
    if (userProfiles.length === 0) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const ownerUserId = userProfiles[0].id;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id || !/^\d+$/.test(id)) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const deleted = await sql`
      DELETE FROM health_general_checks
      WHERE id = ${parseInt(id, 10)} AND owner_user_id = ${ownerUserId}
      RETURNING id
    `;
    if (deleted.length === 0) {
      return Response.json({ error: "General check not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[health/general-checks] Error deleting check:", error);
    return Response.json(
      { error: "Failed to delete general check" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPOST = withRequestContext(POST);
const wrappedGET = withRequestContext(GET);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedPOST as POST, wrappedGET as GET, wrappedDELETE as DELETE };
