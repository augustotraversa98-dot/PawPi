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

    const allergies = await sql`
      SELECT * FROM pet_allergies 
      WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
      ORDER BY created_at DESC
    `;

    return Response.json({ allergies });
  } catch (error) {
    console.error("[Vet Record Allergies] Error:", error);
    return Response.json(
      { error: "Failed to fetch allergies" },
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
    const { petId, allergen, severity, reaction, diagnosedDate, notes } = body;

    if (!petId || !allergen) {
      return Response.json(
        { error: "petId and allergen are required" },
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
      INSERT INTO pet_allergies (
        pet_id, owner_user_id, allergen, severity, reaction, diagnosed_date, notes
      ) VALUES (
        ${petId}, ${ownerUserId}, ${allergen}, ${severity || null}, 
        ${reaction || null}, ${diagnosedDate || null}, ${notes || null}
      )
      RETURNING *
    `;

    return Response.json({ allergy: result[0] });
  } catch (error) {
    console.error("[Vet Record Allergies] Error:", error);
    return Response.json(
      { error: "Failed to create allergy" },
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
      DELETE FROM pet_allergies 
      WHERE id = ${id} AND owner_user_id = ${ownerUserId}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("[Vet Record Allergies] Error:", error);
    return Response.json(
      { error: "Failed to delete allergy" },
      { status: 500 },
    );
  }
}
