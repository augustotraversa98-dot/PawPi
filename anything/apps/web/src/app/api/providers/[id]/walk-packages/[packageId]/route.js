import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import {
  requireProviderRole,
  requireProviderCapability,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// One walk package — update (price/count/currency/active) and SOFT delete (active=false).
// Ticket B2. owner|admin only + the 'walker' capability gate. Every write is scoped by BOTH the
// path provider :id AND the child packageId (a package of another provider matches no row → 404).
// A non-integer packageId 404s before any SQL.

async function PATCH(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const packageId = params.packageId;
    if (!/^\d+$/.test(String(packageId))) {
      return Response.json({ error: "Walk package not found" }, { status: 404 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderCapability(providerId, "walker");
    await requireProviderRole(providerId, userId);

    const body = (await request.json()) ?? {};
    const { walks_count, price_cents, currency, active } = body;

    // Validate only the fields that were provided (partial update via COALESCE).
    if (
      walks_count !== undefined &&
      walks_count !== null &&
      (!Number.isInteger(walks_count) || walks_count <= 0)
    ) {
      return Response.json({ error: "walks_count must be a positive integer" }, { status: 400 });
    }
    if (
      price_cents !== undefined &&
      price_cents !== null &&
      (!Number.isInteger(price_cents) || price_cents < 0)
    ) {
      return Response.json({ error: "price_cents must be a non-negative integer" }, { status: 400 });
    }

    const result = await sql`
      UPDATE walk_packages SET
        walks_count = COALESCE(${walks_count ?? null}, walks_count),
        price_cents = COALESCE(${price_cents ?? null}, price_cents),
        currency = COALESCE(${currency ?? null}, currency),
        active = COALESCE(${active ?? null}, active)
      WHERE id = ${packageId} AND provider_id = ${providerId}
      RETURNING id, provider_id, walks_count, price_cents, currency, active, created_at
    `;
    if (result.length === 0) {
      return Response.json({ error: "Walk package not found" }, { status: 404 });
    }

    return Response.json({ package: result[0] });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[PATCH /api/providers/[id]/walk-packages/[packageId]] Error:", e?.message);
    return Response.json({ error: "Failed to update walk package" }, { status: 500 });
  }
}

async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    const packageId = params.packageId;
    if (!/^\d+$/.test(String(packageId))) {
      return Response.json({ error: "Walk package not found" }, { status: 404 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderCapability(providerId, "walker");
    await requireProviderRole(providerId, userId);

    // SOFT delete (active=false) — a purchased walk_credit_packs row may reference the order, and a
    // future re-activate is a PATCH active=true.
    const result = await sql`
      UPDATE walk_packages SET active = false
      WHERE id = ${packageId} AND provider_id = ${providerId}
      RETURNING id, provider_id, walks_count, price_cents, currency, active, created_at
    `;
    if (result.length === 0) {
      return Response.json({ error: "Walk package not found" }, { status: 404 });
    }

    return Response.json({ package: result[0] });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[DELETE /api/providers/[id]/walk-packages/[packageId]] Error:", e?.message);
    return Response.json({ error: "Failed to delete walk package" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
const wrappedDELETE = withRequestContext(DELETE);
export { wrappedPATCH as PATCH, wrappedDELETE as DELETE };
