import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

// Get unified health timeline for today
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
        { status: 404 }
      );
    }

    const ownerUserId = userProfiles[0].id;

    const { searchParams } = new URL(request.url);
    const petId = searchParams.get("petId");
    const date =
      searchParams.get("date") || new Date().toISOString().split("T")[0];

    // Get start and end of the requested date
    const startOfDay = `${date}T00:00:00Z`;
    const endOfDay = `${date}T23:59:59Z`;

    let timeline = [];

    // Fetch food logs
    const foodLogs = petId
      ? await sql`
          SELECT 'food' as event_type, id, logged_at as event_time, meal_type, food_name, notes
          FROM health_food_logs
          WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `
      : await sql`
          SELECT 'food' as event_type, id, logged_at as event_time, meal_type, food_name, notes
          FROM health_food_logs
          WHERE owner_user_id = ${ownerUserId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `;

    timeline.push(
      ...foodLogs.map((log) => ({
        type: "food",
        id: log.id,
        time: log.event_time,
        title: log.meal_type ? `${log.meal_type} meal` : "Food logged",
        summary: log.food_name || "Meal recorded",
        icon: "🍽️",
      }))
    );

    // Fetch poo logs
    const pooLogs = petId
      ? await sql`
          SELECT 'poo' as event_type, id, logged_at as event_time, amount, shape, color, notes
          FROM health_poo_logs
          WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `
      : await sql`
          SELECT 'poo' as event_type, id, logged_at as event_time, amount, shape, color, notes
          FROM health_poo_logs
          WHERE owner_user_id = ${ownerUserId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `;

    timeline.push(
      ...pooLogs.map((log) => ({
        type: "poo",
        id: log.id,
        time: log.event_time,
        title: "Bathroom break",
        summary: [log.amount, log.shape, log.color].filter(Boolean).join(", "),
        icon: "💩",
      }))
    );

    // Fetch walk logs
    const walkLogs = petId
      ? await sql`
          SELECT 'walk' as event_type, id, start_time as event_time, duration_minutes, distance, notes
          FROM health_walk_logs
          WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
            AND start_time >= ${startOfDay} AND start_time <= ${endOfDay}
        `
      : await sql`
          SELECT 'walk' as event_type, id, start_time as event_time, duration_minutes, distance, notes
          FROM health_walk_logs
          WHERE owner_user_id = ${ownerUserId}
            AND start_time >= ${startOfDay} AND start_time <= ${endOfDay}
        `;

    timeline.push(
      ...walkLogs.map((log) => ({
        type: "walk",
        id: log.id,
        time: log.event_time,
        title: "Walk",
        summary:
          log.duration_minutes || log.distance
            ? `${log.duration_minutes || "?"} min${
                log.distance ? `, ${log.distance} mi` : ""
              }`
            : "Exercise logged",
        icon: "🚶",
      }))
    );

    // Fetch general checks
    const generalChecks = petId
      ? await sql`
          SELECT 'general_check' as event_type, id, logged_at as event_time, mood, energy, notes
          FROM health_general_checks
          WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `
      : await sql`
          SELECT 'general_check' as event_type, id, logged_at as event_time, mood, energy, notes
          FROM health_general_checks
          WHERE owner_user_id = ${ownerUserId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `;

    timeline.push(
      ...generalChecks.map((check) => ({
        type: "general_check",
        id: check.id,
        time: check.event_time,
        title: "General check",
        summary: [check.mood, check.energy].filter(Boolean).join(", "),
        icon: "🔍",
      }))
    );

    // Fetch photo checks
    const photoChecks = petId
      ? await sql`
          SELECT 'photo_check' as event_type, id, created_at as event_time, body_area, notes
          FROM health_photo_checks
          WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
            AND created_at >= ${startOfDay} AND created_at <= ${endOfDay}
        `
      : await sql`
          SELECT 'photo_check' as event_type, id, created_at as event_time, body_area, notes
          FROM health_photo_checks
          WHERE owner_user_id = ${ownerUserId}
            AND created_at >= ${startOfDay} AND created_at <= ${endOfDay}
        `;

    timeline.push(
      ...photoChecks.map((check) => ({
        type: "photo_check",
        id: check.id,
        time: check.event_time,
        title: "Photo check",
        summary: check.body_area ? `${check.body_area} area` : "Photo logged",
        icon: "📸",
      }))
    );

    // Fetch pee logs
    const peeLogs = petId
      ? await sql`
          SELECT 'pee' as event_type, id, logged_at as event_time, frequency, volume, color, notes
          FROM health_pee_logs
          WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `
      : await sql`
          SELECT 'pee' as event_type, id, logged_at as event_time, frequency, volume, color, notes
          FROM health_pee_logs
          WHERE owner_user_id = ${ownerUserId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `;

    timeline.push(
      ...peeLogs.map((log) => ({
        type: "pee",
        id: log.id,
        time: log.event_time,
        title: "Pee logged",
        summary: [log.volume, log.color].filter(Boolean).join(", "),
        icon: "💧",
      }))
    );

    // Fetch vomit logs
    const vomitLogs = petId
      ? await sql`
          SELECT 'vomit' as event_type, id, logged_at as event_time, number_of_episodes, appearance, notes
          FROM health_vomit_logs
          WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `
      : await sql`
          SELECT 'vomit' as event_type, id, logged_at as event_time, number_of_episodes, appearance, notes
          FROM health_vomit_logs
          WHERE owner_user_id = ${ownerUserId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `;

    timeline.push(
      ...vomitLogs.map((log) => ({
        type: "vomit",
        id: log.id,
        time: log.event_time,
        title: "Digestive event logged",
        summary: log.appearance
          ? `${log.number_of_episodes || 1} episode(s), ${log.appearance}`
          : `${log.number_of_episodes || 1} episode(s)`,
        icon: "🤢",
      }))
    );

    // Fetch mobility logs
    const mobilityLogs = petId
      ? await sql`
          SELECT 'mobility' as event_type, id, logged_at as event_time, limping, stiffness, difficulty_standing, notes
          FROM health_mobility_logs
          WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `
      : await sql`
          SELECT 'mobility' as event_type, id, logged_at as event_time, limping, stiffness, difficulty_standing, notes
          FROM health_mobility_logs
          WHERE owner_user_id = ${ownerUserId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `;

    timeline.push(
      ...mobilityLogs.map((log) => ({
        type: "mobility",
        id: log.id,
        time: log.event_time,
        title: "Mobility note logged",
        summary:
          [
            log.limping ? "limping" : null,
            log.stiffness ? "stiffness" : null,
            log.difficulty_standing ? "difficulty standing" : null,
          ]
            .filter(Boolean)
            .join(", ") || "Mobility checked",
        icon: "🦴",
      }))
    );

    // Fetch weight logs
    const weightLogs = petId
      ? await sql`
          SELECT 'weight' as event_type, id, logged_at as event_time, weight, weight_unit, body_shape_estimate, notes
          FROM health_weight_logs
          WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `
      : await sql`
          SELECT 'weight' as event_type, id, logged_at as event_time, weight, weight_unit, body_shape_estimate, notes
          FROM health_weight_logs
          WHERE owner_user_id = ${ownerUserId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `;

    timeline.push(
      ...weightLogs.map((log) => ({
        type: "weight",
        id: log.id,
        time: log.event_time,
        title: "Weight logged",
        summary: `${log.weight} ${log.weight_unit}${
          log.body_shape_estimate ? ` • ${log.body_shape_estimate}` : ""
        }`,
        icon: "⚖️",
      }))
    );

    // Fetch medical care logs
    const medicalCareLogs = petId
      ? await sql`
          SELECT 'medical_care' as event_type, id, given_at as event_time,
                 care_type, name, dose, status, notes, reaction_or_issue
          FROM health_medical_care_logs
          WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
            AND given_at >= ${startOfDay} AND given_at <= ${endOfDay}
        `
      : await sql`
          SELECT 'medical_care' as event_type, id, given_at as event_time,
                 care_type, name, dose, status, notes, reaction_or_issue
          FROM health_medical_care_logs
          WHERE owner_user_id = ${ownerUserId}
            AND given_at >= ${startOfDay} AND given_at <= ${endOfDay}
        `;

    const careTypeIcons = {
      medication: "💊",
      vaccine: "💉",
      flea_tick: "🛡️",
      deworming: "🪱",
      heartworm: "🫀",
      supplement: "🧪",
      other: "📋",
    };

    timeline.push(
      ...medicalCareLogs.map((log) => ({
        type: "medical_care",
        id: log.id,
        time: log.event_time,
        title: log.name || "Medical care",
        summary:
          log.status === "issue_reported"
            ? "Issue reported"
            : log.dose
            ? `${log.dose}`
            : log.care_type
            ? log.care_type.replace("_", " ")
            : "Logged",
        icon: careTypeIcons[log.care_type] || "💊",
      }))
    );

    // Sort by time (most recent first)
    timeline.sort((a, b) => new Date(b.time) - new Date(a.time));

    return Response.json({ timeline }, { status: 200 });
  } catch (error) {
    console.error("[health/timeline] Error fetching timeline:", error);
    return Response.json(
      { error: "Failed to fetch health timeline" },
      { status: 500 }
    );
  }
}