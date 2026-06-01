import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

export async function POST(request) {
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

    const body = await request.json();
    const {
      petId,
      amount,
      shape,
      color,
      blood,
      mucus,
      straining,
      accidentInHouse,
      photoUrl,
      notes,
    } = body;

    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    const pets = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${ownerUserId}
    `;

    if (pets.length === 0) {
      return Response.json(
        { error: "Pet not found or access denied" },
        { status: 403 },
      );
    }

    const result = await sql`
      INSERT INTO health_poo_logs (
        pet_id,
        owner_user_id,
        amount,
        shape,
        color,
        blood,
        mucus,
        straining,
        accident_in_house,
        photo_url,
        notes
      ) VALUES (
        ${petId},
        ${ownerUserId},
        ${amount || null},
        ${shape || null},
        ${color || null},
        ${blood || false},
        ${mucus || false},
        ${straining || false},
        ${accidentInHouse || false},
        ${photoUrl || null},
        ${notes || null}
      )
      RETURNING *
    `;

    console.log("[health/poo-logs] Log created:", result[0]);
    return Response.json({ log: result[0] }, { status: 201 });
  } catch (error) {
    console.error("[health/poo-logs] Error creating log:", error);
    return Response.json(
      { error: "Failed to create poo log" },
      { status: 500 },
    );
  }
}

export async function GET(request) {
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

    let logs;
    if (petId) {
      logs = await sql`
        SELECT * FROM health_poo_logs
        WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
        ORDER BY logged_at DESC
        LIMIT ${limit}
      `;
    } else {
      logs = await sql`
        SELECT * FROM health_poo_logs
        WHERE owner_user_id = ${ownerUserId}
        ORDER BY logged_at DESC
        LIMIT ${limit}
      `;
    }

    return Response.json({ logs }, { status: 200 });
  } catch (error) {
    console.error("[health/poo-logs] Error fetching logs:", error);
    return Response.json(
      { error: "Failed to fetch poo logs" },
      { status: 500 },
    );
  }
}
