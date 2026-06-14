import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { requireProviderRole } from "@/app/api/utils/providerAuth";
import { jsonbWriteValue } from "@/app/api/utils/jsonb";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { invalidLocationFields } from "@/app/api/utils/providerValidation";

// One provider location — update and hard delete (owner|admin). Ticket 4b.
//
// CROSS-PROVIDER ISOLATION: every write is scoped by BOTH the path provider :id
// AND the child locationId (WHERE id = ${locationId} AND provider_id =
// ${providerId}). Authorizing on :id alone is not enough — an owner of provider
// A could otherwise edit provider B's location by passing A as :id and B's
// locationId. A child id that doesn't belong to :id matches no row -> 404.
// hours_json is jsonb: written with sql.json(...) (SCHEMA_NOTES jsonb gotcha).

// Update a location — owner|admin only. Partial: omitted fields are preserved
// via COALESCE (the routines route convention).
export async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const locationId = params.locationId;
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

    // Scoped by id AND provider_id — cross-provider writes match no row -> 404.
    const result = await sql`
      UPDATE provider_locations SET
        name = COALESCE(${name ?? null}, name),
        address = COALESCE(${address ?? null}, address),
        lat = COALESCE(${lat ?? null}, lat),
        lng = COALESCE(${lng ?? null}, lng),
        hours_json = COALESCE(${
          hours_json != null ? sql.json(jsonbWriteValue(hours_json)) : null
        }, hours_json),
        phone = COALESCE(${phone ?? null}, phone),
        updated_at = NOW()
      WHERE id = ${locationId} AND provider_id = ${providerId}
      RETURNING *
    `;

    if (result.length === 0) {
      return Response.json({ error: "Location not found" }, { status: 404 });
    }

    return Response.json({ location: result[0] });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "[PATCH /api/providers/[id]/locations/[locationId]] Error:",
      error.message,
    );
    return Response.json(
      { error: "Failed to update location" },
      { status: 500 },
    );
  }
}

// Hard delete a location — owner|admin only. vet_appointments.provider_location_id
// is ON DELETE SET NULL, so this only unlinks past appointments. Scoped by id AND
// provider_id; a location belonging to another provider matches no row -> 404.
export async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const locationId = params.locationId;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderRole(providerId, userId);

    const deleted = await sql`
      DELETE FROM provider_locations
      WHERE id = ${locationId} AND provider_id = ${providerId}
      RETURNING id
    `;

    if (deleted.length === 0) {
      return Response.json({ error: "Location not found" }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "[DELETE /api/providers/[id]/locations/[locationId]] Error:",
      error.message,
    );
    return Response.json(
      { error: "Failed to delete location" },
      { status: 500 },
    );
  }
}
