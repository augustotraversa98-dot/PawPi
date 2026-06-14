import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import {
  requireProviderRole,
  ALL_PROVIDER_ROLES,
} from "@/app/api/utils/providerAuth";

// Provider services — list (any active staff) and create (owner|admin).
// Ticket 4b (docs/provider-design.md §4 item 4). The list returns ALL of the
// provider's services (active AND inactive) — discovery-time filtering is ticket
// 5. Identity resolves auth_users.id -> user_profiles.id like the 4a routes;
// authorization is by provider_staff membership via requireProviderRole.

async function resolveUserId(authUserId) {
  const userProfile = await sql`
    SELECT id FROM user_profiles WHERE auth_user_id = ${authUserId} LIMIT 1
  `;
  return userProfile.length === 0 ? null : userProfile[0].id;
}

// Validate optional money/duration fields. Returns an error message or null.
// price_cents/deposit_cents: non-negative integers; duration_min: positive
// integer. Absent (undefined/null) values are allowed.
function invalidServiceFields(body) {
  const { duration_min, price_cents, deposit_cents } = body;
  if (
    price_cents !== undefined &&
    price_cents !== null &&
    (!Number.isInteger(price_cents) || price_cents < 0)
  ) {
    return "price_cents must be a non-negative integer";
  }
  if (
    deposit_cents !== undefined &&
    deposit_cents !== null &&
    (!Number.isInteger(deposit_cents) || deposit_cents < 0)
  ) {
    return "deposit_cents must be a non-negative integer";
  }
  if (
    duration_min !== undefined &&
    duration_min !== null &&
    (!Number.isInteger(duration_min) || duration_min <= 0)
  ) {
    return "duration_min must be a positive integer";
  }
  return null;
}

// List ALL of this provider's services (active + inactive) — any active staff.
export async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    const services = await sql`
      SELECT * FROM provider_services
      WHERE provider_id = ${providerId}
      ORDER BY created_at ASC
    `;

    return Response.json({ services });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[GET /api/providers/[id]/services] Error:", error.message);
    return Response.json({ error: "Failed to fetch services" }, { status: 500 });
  }
}

// Create a service for this provider — owner|admin only. name required; active
// defaults true.
export async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderRole(providerId, userId);

    const body = (await request.json()) ?? {};

    if (!body.name) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }

    const fieldError = invalidServiceFields(body);
    if (fieldError) {
      return Response.json({ error: fieldError }, { status: 400 });
    }

    const { name, description, duration_min, price_cents, deposit_cents, active } =
      body;

    const created = await sql`
      INSERT INTO provider_services
        (provider_id, name, description, duration_min, price_cents, deposit_cents, active)
      VALUES (
        ${providerId},
        ${name},
        ${description ?? null},
        ${duration_min ?? null},
        ${price_cents ?? null},
        ${deposit_cents ?? null},
        ${active === undefined ? true : active}
      )
      RETURNING *
    `;

    return Response.json({ service: created[0] }, { status: 201 });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[POST /api/providers/[id]/services] Error:", error.message);
    return Response.json(
      { error: "Failed to create service" },
      { status: 500 },
    );
  }
}
