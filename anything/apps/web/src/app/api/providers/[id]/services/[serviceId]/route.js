import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { requireProviderRole } from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { invalidServiceFields } from "@/app/api/utils/providerValidation";

// One provider service — update and SOFT delete (owner|admin). Ticket 4b.
//
// CROSS-PROVIDER ISOLATION: every write is scoped by BOTH the path provider :id
// AND the child serviceId (WHERE id = ${serviceId} AND provider_id =
// ${providerId}). Authorizing on :id alone is not enough. A child id that
// doesn't belong to :id matches no row -> 404.
//
// DELETE is a SOFT delete (active=false), NOT a row delete: vet_appointments
// .service_id references this row and past bookings must keep their service.
// Reactivation is PATCH active=true.

// Update a service — owner|admin only. Partial via COALESCE; `active` toggles
// here too (PATCH active=true reactivates a soft-deleted service). Omitted fields
// are preserved.
export async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const serviceId = params.serviceId;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderRole(providerId, userId);

    const body = (await request.json()) ?? {};

    const fieldError = invalidServiceFields(body);
    if (fieldError) {
      return Response.json({ error: fieldError }, { status: 400 });
    }

    const { name, description, duration_min, price_cents, deposit_cents, active } =
      body;

    // Scoped by id AND provider_id — cross-provider writes match no row -> 404.
    // `active` uses ?? null so an explicit false is honored (only undefined falls
    // through to COALESCE keeping the existing value).
    const result = await sql`
      UPDATE provider_services SET
        name = COALESCE(${name ?? null}, name),
        description = COALESCE(${description ?? null}, description),
        duration_min = COALESCE(${duration_min ?? null}, duration_min),
        price_cents = COALESCE(${price_cents ?? null}, price_cents),
        deposit_cents = COALESCE(${deposit_cents ?? null}, deposit_cents),
        active = COALESCE(${active ?? null}, active),
        updated_at = NOW()
      WHERE id = ${serviceId} AND provider_id = ${providerId}
      RETURNING *
    `;

    if (result.length === 0) {
      return Response.json({ error: "Service not found" }, { status: 404 });
    }

    return Response.json({ service: result[0] });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "[PATCH /api/providers/[id]/services/[serviceId]] Error:",
      error.message,
    );
    return Response.json(
      { error: "Failed to update service" },
      { status: 500 },
    );
  }
}

// SOFT delete a service — owner|admin only. Sets active=false (NOT a row delete)
// because vet_appointments.service_id references it. Scoped by id AND
// provider_id; a service belonging to another provider matches no row -> 404.
export async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const serviceId = params.serviceId;
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderRole(providerId, userId);

    const result = await sql`
      UPDATE provider_services
      SET active = false, updated_at = NOW()
      WHERE id = ${serviceId} AND provider_id = ${providerId}
      RETURNING *
    `;

    if (result.length === 0) {
      return Response.json({ error: "Service not found" }, { status: 404 });
    }

    return Response.json({ service: result[0] });
  } catch (error) {
    if (error.status === 403) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error(
      "[DELETE /api/providers/[id]/services/[serviceId]] Error:",
      error.message,
    );
    return Response.json(
      { error: "Failed to delete service" },
      { status: 500 },
    );
  }
}
