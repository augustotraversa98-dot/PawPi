import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user_profiles.id from auth_users.id
    const userProfileRows = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;
    if (userProfileRows.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }
    const userProfileId = userProfileRows[0].id;

    const { searchParams } = new URL(request.url);
    const petId = searchParams.get("petId");
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!petId || !Number.isInteger(parseInt(petId))) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    const logs = await sql`
      SELECT * FROM health_weight_logs
      WHERE pet_id = ${parseInt(petId)} AND owner_user_id = ${userProfileId}
      ORDER BY logged_at DESC
      LIMIT ${limit}
    `;

    return Response.json({ logs });
  } catch (error) {
    console.error("Error fetching weight logs:", error);
    return Response.json(
      { error: "Failed to fetch weight logs" },
      { status: 500 },
    );
  }
}

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user_profiles.id from auth_users.id
    const userProfileRows = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;
    if (userProfileRows.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }
    const userProfileId = userProfileRows[0].id;

    const body = await request.json();
    const { petId, weight, weightUnit, bodyShapeEstimate, photoUrl, notes } =
      body;

    if (
      !petId ||
      !Number.isInteger(parseInt(petId)) ||
      weight === undefined ||
      weight === null
    ) {
      return Response.json(
        { error: "petId and weight are required" },
        { status: 400 },
      );
    }

    const result = await sql`
      INSERT INTO health_weight_logs (
        pet_id, owner_user_id, weight, weight_unit,
        body_shape_estimate, photo_url, notes
      ) VALUES (
        ${parseInt(petId)},
        ${userProfileId},
        ${parseFloat(weight)},
        ${weightUnit || "lbs"},
        ${bodyShapeEstimate || null},
        ${photoUrl || null},
        ${notes || null}
      )
      RETURNING *
    `;

    return Response.json({ log: result[0] }, { status: 201 });
  } catch (error) {
    console.error("Error creating weight log:", error);
    return Response.json(
      { error: "Failed to create weight log" },
      { status: 500 },
    );
  }
}

// DELETE /api/health/weight-logs?id= — owner removes one of their own weight entries (App Store
// readiness 2.78: completes the previously no-op delete button). Owner-scoped; a non-owner deletes
// ZERO → 404.
async function DELETE(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userProfileRows = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;
    if (userProfileRows.length === 0) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const userProfileId = userProfileRows[0].id;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const deleted = await sql`
      DELETE FROM health_weight_logs
      WHERE id = ${parseInt(id)} AND owner_user_id = ${userProfileId}
      RETURNING id
    `;
    if (deleted.length === 0) {
      return Response.json({ error: "Weight entry not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Error deleting weight log:", error);
    return Response.json({ error: "Failed to delete weight log" }, { status: 500 });
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedGET as GET, wrappedPOST as POST, wrappedDELETE as DELETE };
