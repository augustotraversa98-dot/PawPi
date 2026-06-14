import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import {
  requireProviderRole,
  ALL_PROVIDER_ROLES,
} from "@/app/api/utils/providerAuth";
import { jsonbWriteValue } from "@/app/api/utils/jsonb";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { invalidLocationFields } from "@/app/api/utils/providerValidation";

// Provider locations — list (any active staff) and create (owner|admin).
// Ticket 4b (docs/provider-design.md §4 item 4). Identity resolves
// auth_users.id -> user_profiles.id exactly like the 4a routes; authorization is
// by provider_staff membership via requireProviderRole, scoped to the path :id.
// hours_json is jsonb: written with sql.json(...) so the driver encodes it once
// (SCHEMA_NOTES jsonb gotcha) — never JSON.stringify.

// List this provider's locations — any active staff member.
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

    const locations = await sql`
      SELECT * FROM provider_locations
      WHERE provider_id = ${providerId}
      ORDER BY created_at ASC
    `;

    return Response.json({ locations });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[GET /api/providers/[id]/locations] Error:", error.message);
    return Response.json(
      { error: "Failed to fetch locations" },
      { status: 500 },
    );
  }
}

// Create a location for this provider — owner|admin only.
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

    const fieldError = invalidLocationFields(body);
    if (fieldError) {
      return Response.json({ error: fieldError }, { status: 400 });
    }

    const { name, address, lat, lng, hours_json, phone } = body;

    const created = await sql`
      INSERT INTO provider_locations
        (provider_id, name, address, lat, lng, hours_json, phone)
      VALUES (
        ${providerId},
        ${name ?? null},
        ${address ?? null},
        ${lat ?? null},
        ${lng ?? null},
        ${hours_json != null ? sql.json(jsonbWriteValue(hours_json)) : null},
        ${phone ?? null}
      )
      RETURNING *
    `;

    return Response.json({ location: created[0] }, { status: 201 });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[POST /api/providers/[id]/locations] Error:", error.message);
    return Response.json(
      { error: "Failed to create location" },
      { status: 500 },
    );
  }
}
