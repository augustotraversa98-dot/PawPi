import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

export async function GET(request) {
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

    const userProfile = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;

    if (!userProfile || userProfile.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const ownerUserId = userProfile[0].id;

    const labResults = await sql`
      SELECT * FROM pet_lab_results 
      WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
      ORDER BY test_date DESC
    `;

    return Response.json({ labResults });
  } catch (error) {
    console.error("[Vet Record Lab Results] Error:", error);
    return Response.json(
      { error: "Failed to fetch lab results" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { petId, testName, testDate, results, orderedBy, notes } = body;

    if (!petId || !testName || !testDate) {
      return Response.json(
        { error: "petId, testName, and testDate are required" },
        { status: 400 },
      );
    }

    const userProfile = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;

    if (!userProfile || userProfile.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const ownerUserId = userProfile[0].id;

    const result = await sql`
      INSERT INTO pet_lab_results (
        pet_id, owner_user_id, test_name, test_date, results, ordered_by, notes
      ) VALUES (
        ${petId}, ${ownerUserId}, ${testName}, ${testDate}, ${results || null}, 
        ${orderedBy || null}, ${notes || null}
      )
      RETURNING *
    `;

    return Response.json({ labResult: result[0] });
  } catch (error) {
    console.error("[Vet Record Lab Results] Error:", error);
    return Response.json(
      { error: "Failed to create lab result" },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const userProfile = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;

    if (!userProfile || userProfile.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const ownerUserId = userProfile[0].id;

    await sql`
      DELETE FROM pet_lab_results 
      WHERE id = ${id} AND owner_user_id = ${ownerUserId}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("[Vet Record Lab Results] Error:", error);
    return Response.json(
      { error: "Failed to delete lab result" },
      { status: 500 },
    );
  }
}
