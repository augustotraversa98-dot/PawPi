import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { moderationResponse } from "@/app/api/utils/moderateText";

// Get or create user profile
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authUserId = session.user.id;

    // Check if user profile exists
    let profile = await sql`
      SELECT * FROM user_profiles 
      WHERE auth_user_id = ${authUserId}
      LIMIT 1
    `;

    if (profile.length === 0) {
      // Create new user profile
      profile = await sql`
        INSERT INTO user_profiles (auth_user_id, full_name, username, role)
        VALUES (
          ${authUserId},
          ${session.user.name || null},
          ${session.user.email?.split("@")[0] || null},
          'pet_owner'
        )
        RETURNING *
      `;
    }

    return Response.json({ profile: profile[0] });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return Response.json(
      { error: "Failed to fetch user profile" },
      { status: 500 },
    );
  }
}

// Update user profile
async function PATCH(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authUserId = session.user.id;
    const body = await request.json();
    const { full_name, username, avatar_url, onboarding_completed } = body;

    // Content filter (T7): reject objectionable display name / username before write.
    const blockedProfile = moderationResponse(full_name, username);
    if (blockedProfile) return blockedProfile;

    // Get user profile ID
    const existingProfile = await sql`
      SELECT id FROM user_profiles 
      WHERE auth_user_id = ${authUserId}
      LIMIT 1
    `;

    if (existingProfile.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const profileId = existingProfile[0].id;

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (full_name !== undefined) {
      updates.push(`full_name = $${paramIndex++}`);
      values.push(full_name);
    }
    if (username !== undefined) {
      updates.push(`username = $${paramIndex++}`);
      values.push(username);
    }
    if (avatar_url !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`);
      values.push(avatar_url);
    }
    if (onboarding_completed !== undefined) {
      updates.push(`onboarding_completed = $${paramIndex++}`);
      values.push(onboarding_completed);
    }

    updates.push(`updated_at = NOW()`);

    if (updates.length === 1) {
      // Only updated_at, no changes
      return Response.json({ success: true });
    }

    values.push(profileId);

    const updateQuery = `
      UPDATE user_profiles 
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await sql.unsafe(updateQuery, values);

    return Response.json({ profile: result[0] });
  } catch (error) {
    console.error("Error updating user profile:", error);
    return Response.json(
      { error: "Failed to update user profile" },
      { status: 500 },
    );
  }
}

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
const wrappedPATCH = withRequestContext(PATCH);
export { wrappedGET as GET, wrappedPATCH as PATCH };
