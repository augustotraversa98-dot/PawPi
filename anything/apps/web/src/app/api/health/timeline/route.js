import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Get unified health timeline for today
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

    // ── Nine independent per-log-type sources ── none depends on another's result, so
    // awaiting them one after another was serializing nine DB round-trips into every
    // request (Autofix HighLatencyP95, same pattern/fix as c2c2f39). postgres.js
    // pipelines concurrently-issued queries on the same connection, so Promise.all is
    // safe here even though all of them run inside the request's single transaction
    // (withRequestContext). Query text/filters/response shape unchanged.
    const [
      foodLogs,
      pooLogs,
      walkLogs,
      generalChecks,
      photoChecks,
      peeLogs,
      vomitLogs,
      mobilityLogs,
      weightLogs,
      medicalCareLogs,
    ] = await Promise.all([
      // Fetch food logs
      petId
        ? sql`
          SELECT 'food' as event_type, id, logged_at as event_time, meal_type, food_name, notes
          FROM health_food_logs
          WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `
        : sql`
          SELECT 'food' as event_type, id, logged_at as event_time, meal_type, food_name, notes
          FROM health_food_logs
          WHERE owner_user_id = ${ownerUserId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `,
      // Fetch poo logs
      petId
        ? sql`
          SELECT 'poo' as event_type, id, logged_at as event_time, amount, shape, color, notes
          FROM health_poo_logs
          WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `
        : sql`
          SELECT 'poo' as event_type, id, logged_at as event_time, amount, shape, color, notes
          FROM health_poo_logs
          WHERE owner_user_id = ${ownerUserId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `,
      // Fetch walk logs
      petId
        ? sql`
          SELECT 'walk' as event_type, id, start_time as event_time, duration_minutes, distance, notes
          FROM health_walk_logs
          WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
            AND start_time >= ${startOfDay} AND start_time <= ${endOfDay}
        `
        : sql`
          SELECT 'walk' as event_type, id, start_time as event_time, duration_minutes, distance, notes
          FROM health_walk_logs
          WHERE owner_user_id = ${ownerUserId}
            AND start_time >= ${startOfDay} AND start_time <= ${endOfDay}
        `,
      // Fetch general checks
      petId
        ? sql`
          SELECT 'general_check' as event_type, id, logged_at as event_time, mood, energy, notes
          FROM health_general_checks
          WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `
        : sql`
          SELECT 'general_check' as event_type, id, logged_at as event_time, mood, energy, notes
          FROM health_general_checks
          WHERE owner_user_id = ${ownerUserId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `,
      // Fetch photo checks
      petId
        ? sql`
          SELECT 'photo_check' as event_type, id, created_at as event_time, body_area, notes
          FROM health_photo_checks
          WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
            AND created_at >= ${startOfDay} AND created_at <= ${endOfDay}
        `
        : sql`
          SELECT 'photo_check' as event_type, id, created_at as event_time, body_area, notes
          FROM health_photo_checks
          WHERE owner_user_id = ${ownerUserId}
            AND created_at >= ${startOfDay} AND created_at <= ${endOfDay}
        `,
      // Fetch pee logs
      petId
        ? sql`
          SELECT 'pee' as event_type, id, logged_at as event_time, frequency, volume, color, notes
          FROM health_pee_logs
          WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `
        : sql`
          SELECT 'pee' as event_type, id, logged_at as event_time, frequency, volume, color, notes
          FROM health_pee_logs
          WHERE owner_user_id = ${ownerUserId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `,
      // Fetch vomit logs
      petId
        ? sql`
          SELECT 'vomit' as event_type, id, logged_at as event_time, number_of_episodes, appearance, notes
          FROM health_vomit_logs
          WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `
        : sql`
          SELECT 'vomit' as event_type, id, logged_at as event_time, number_of_episodes, appearance, notes
          FROM health_vomit_logs
          WHERE owner_user_id = ${ownerUserId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `,
      // Fetch mobility logs
      petId
        ? sql`
          SELECT 'mobility' as event_type, id, logged_at as event_time, limping, stiffness, difficulty_standing, notes
          FROM health_mobility_logs
          WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `
        : sql`
          SELECT 'mobility' as event_type, id, logged_at as event_time, limping, stiffness, difficulty_standing, notes
          FROM health_mobility_logs
          WHERE owner_user_id = ${ownerUserId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `,
      // Fetch weight logs
      petId
        ? sql`
          SELECT 'weight' as event_type, id, logged_at as event_time, weight, weight_unit, body_shape_estimate, notes
          FROM health_weight_logs
          WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `
        : sql`
          SELECT 'weight' as event_type, id, logged_at as event_time, weight, weight_unit, body_shape_estimate, notes
          FROM health_weight_logs
          WHERE owner_user_id = ${ownerUserId}
            AND logged_at >= ${startOfDay} AND logged_at <= ${endOfDay}
        `,
      // Fetch medical care logs
      petId
        ? sql`
          SELECT 'medical_care' as event_type, id, given_at as event_time,
                 care_type, name, dose, status, notes, reaction_or_issue
          FROM health_medical_care_logs
          WHERE owner_user_id = ${ownerUserId} AND pet_id = ${petId}
            AND given_at >= ${startOfDay} AND given_at <= ${endOfDay}
        `
        : sql`
          SELECT 'medical_care' as event_type, id, given_at as event_time,
                 care_type, name, dose, status, notes, reaction_or_issue
          FROM health_medical_care_logs
          WHERE owner_user_id = ${ownerUserId}
            AND given_at >= ${startOfDay} AND given_at <= ${endOfDay}
        `,
    ]);

    timeline.push(
      ...foodLogs.map((log) => ({
        type: "food",
        id: log.id,
        time: log.event_time,
        title: log.meal_type ? `${log.meal_type} meal` : "Food logged",
        summary: log.food_name || "Meal recorded",
        icon: "🍽️",
      })),
      ...pooLogs.map((log) => ({
        type: "poo",
        id: log.id,
        time: log.event_time,
        title: "Bathroom break",
        summary: [log.amount, log.shape, log.color].filter(Boolean).join(", "),
        icon: "💩",
      })),
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
      })),
      ...generalChecks.map((check) => ({
        type: "general_check",
        id: check.id,
        time: check.event_time,
        title: "General check",
        summary: [check.mood, check.energy].filter(Boolean).join(", "),
        icon: "🔍",
      })),
      ...photoChecks.map((check) => ({
        type: "photo_check",
        id: check.id,
        time: check.event_time,
        title: "Photo check",
        summary: check.body_area ? `${check.body_area} area` : "Photo logged",
        icon: "📸",
      })),
      ...peeLogs.map((log) => ({
        type: "pee",
        id: log.id,
        time: log.event_time,
        title: "Pee logged",
        summary: [log.volume, log.color].filter(Boolean).join(", "),
        icon: "💧",
      })),
      ...vomitLogs.map((log) => ({
        type: "vomit",
        id: log.id,
        time: log.event_time,
        title: "Digestive event logged",
        summary: log.appearance
          ? `${log.number_of_episodes || 1} episode(s), ${log.appearance}`
          : `${log.number_of_episodes || 1} episode(s)`,
        icon: "🤢",
      })),
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
      })),
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

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
