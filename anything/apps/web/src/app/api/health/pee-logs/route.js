import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

export async function GET(request) {
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
    const limit = parseInt(searchParams.get("limit") || "10");

    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    const logs = await sql`
      SELECT * FROM health_pee_logs
      WHERE pet_id = ${parseInt(petId)} AND owner_user_id = ${userProfileId}
      ORDER BY logged_at DESC
      LIMIT ${limit}
    `;

    return Response.json({ logs });
  } catch (error) {
    console.error("Error fetching pee logs:", error);
    return Response.json(
      { error: "Failed to fetch pee logs" },
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
    const {
      petId,
      frequency,
      volume,
      color,
      accidentInHouse,
      difficultyPeeing,
      painOrCrying,
      bloodVisible,
      increasedThirst,
      notes,
    } = body;

    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    const result = await sql`
      INSERT INTO health_pee_logs (
        pet_id, owner_user_id, frequency, volume, color,
        accident_in_house, difficulty_peeing, pain_or_crying,
        blood_visible, increased_thirst, notes
      ) VALUES (
        ${parseInt(petId)},
        ${userProfileId},
        ${frequency || null},
        ${volume || null},
        ${color || null},
        ${accidentInHouse || false},
        ${difficultyPeeing || false},
        ${painOrCrying || false},
        ${bloodVisible || false},
        ${increasedThirst || false},
        ${notes || null}
      )
      RETURNING *
    `;

    return Response.json({ log: result[0] }, { status: 201 });
  } catch (error) {
    console.error("Error creating pee log:", error);
    return Response.json(
      { error: "Failed to create pee log" },
      { status: 500 },
    );
  }
}
