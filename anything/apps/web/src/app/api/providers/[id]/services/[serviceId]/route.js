import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { requireProviderRole } from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import {
  invalidServiceFields,
  invalidImageUrls,
} from "@/app/api/utils/providerValidation";
import { withRequestContext } from "@/app/api/utils/requestContext";

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
async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const serviceId = params.serviceId;
    // Defense-in-depth: a non-integer serviceId (e.g. a static path like "reorder" that reached
    // this dynamic handler) must never be bound as an integer in SQL — 404 before any DB call.
    if (!/^\d+$/.test(String(serviceId))) {
      return Response.json({ error: "Service not found" }, { status: 404 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderRole(providerId, userId);

    const body = (await request.json()) ?? {};

    const fieldError =
      invalidServiceFields(body) || invalidImageUrls(body.image_urls);
    if (fieldError) {
      return Response.json({ error: fieldError }, { status: 400 });
    }

    const {
      name,
      description,
      duration_min,
      price_cents,
      deposit_cents,
      active,
      image_urls,
      payment_policy,
      nightly_rate_cents,
      is_featured,
    } = body;

    // Scoped by id AND provider_id — cross-provider writes match no row -> 404.
    // `active` uses ?? null so an explicit false is honored (only undefined falls
    // through to COALESCE keeping the existing value). image_urls follows the same
    // COALESCE pattern as shop_products: an omitted array keeps the existing images,
    // a provided array (incl. [] to clear) replaces them.
    const result = await sql`
      UPDATE provider_services SET
        name = COALESCE(${name ?? null}, name),
        description = COALESCE(${description ?? null}, description),
        duration_min = COALESCE(${duration_min ?? null}, duration_min),
        price_cents = COALESCE(${price_cents ?? null}, price_cents),
        deposit_cents = COALESCE(${deposit_cents ?? null}, deposit_cents),
        active = COALESCE(${active ?? null}, active),
        image_urls = COALESCE(${Array.isArray(image_urls) ? image_urls : null}, image_urls),
        payment_policy = COALESCE(${payment_policy ?? null}, payment_policy),
        nightly_rate_cents = COALESCE(${nightly_rate_cents ?? null}, nightly_rate_cents),
        is_featured = COALESCE(${is_featured === undefined ? null : is_featured}, is_featured),
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
async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const serviceId = params.serviceId;
    // Defense-in-depth: a non-integer serviceId (e.g. a static path like "reorder" that reached
    // this dynamic handler) must never be bound as an integer in SQL — 404 before any DB call.
    if (!/^\d+$/.test(String(serviceId))) {
      return Response.json({ error: "Service not found" }, { status: 404 });
    }
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

// RLS R1-rollout: identity-scoped wrappers (docs/rls-hardening.md). Handler
// bodies are unchanged — only their DB connection is now request-scoped.
const wrappedPATCH = withRequestContext(PATCH);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedPATCH as PATCH, wrappedDELETE as DELETE };
