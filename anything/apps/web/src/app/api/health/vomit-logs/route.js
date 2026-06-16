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
    const limit = parseInt(searchParams.get("limit") || "10");

    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    const logs = await sql`
      SELECT * FROM health_vomit_logs
      WHERE pet_id = ${parseInt(petId)} AND owner_user_id = ${userProfileId}
      ORDER BY logged_at DESC
      LIMIT ${limit}
    `;

    return Response.json({ logs });
  } catch (error) {
    console.error("Error fetching vomit logs:", error);
    return Response.json(
      { error: "Failed to fetch vomit logs" },
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
    const {
      petId,
      numberOfEpisodes,
      appearance,
      relationToFood,
      appetiteAfter,
      energy,
      diarrheaPresent,
      photoUrl,
      notes,
    } = body;

    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    const result = await sql`
      INSERT INTO health_vomit_logs (
        pet_id, owner_user_id, number_of_episodes, appearance,
        relation_to_food, appetite_after, energy, diarrhea_present,
        photo_url, notes
      ) VALUES (
        ${parseInt(petId)},
        ${userProfileId},
        ${numberOfEpisodes || 1},
        ${appearance || null},
        ${relationToFood || null},
        ${appetiteAfter || null},
        ${energy || null},
        ${diarrheaPresent || false},
        ${photoUrl || null},
        ${notes || null}
      )
      RETURNING *
    `;

    return Response.json({ log: result[0] }, { status: 201 });
  } catch (error) {
    console.error("Error creating vomit log:", error);
    return Response.json(
      { error: "Failed to create vomit log" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
