import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import {
  requireProviderRole,
  requireProviderCapability,
  ALL_PROVIDER_ROLES,
  ProviderAuthError,
} from "@/app/api/utils/providerAuth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext } from "@/app/api/utils/requestContext";

// Walk packages (offerings) — Ticket B2 (docs/phase2-tickets/B2-walk-packages-and-credits.md).
// A walker sets prepaid walk packs (single / 10 / 20, each with a price). Mirrors the services
// CRUD shape:
//   GET  — list ALL of this walker's packages (active + inactive), any active staff.
//   POST — create a package (owner|admin). Soft-delete/reactivate live on [packageId].
// Both gate on requireProviderCapability(id,'walker') — only a walker provider has packages.
//
// Degrade clean: if the walk_packages table is absent (unmigrated prod), GET → { packages: [] }.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").

const isMissingTable = (e) =>
  e?.code === "42P01" || /relation .* does not exist/i.test(e?.message ?? "");

// Validate the money/count fields on a package body. Returns an error string or null.
function invalidPackageFields(body) {
  const { walks_count, price_cents, currency } = body;
  if (
    walks_count === undefined ||
    walks_count === null ||
    !Number.isInteger(walks_count) ||
    walks_count <= 0
  ) {
    return "walks_count must be a positive integer";
  }
  if (
    price_cents === undefined ||
    price_cents === null ||
    !Number.isInteger(price_cents) ||
    price_cents < 0
  ) {
    return "price_cents must be a non-negative integer";
  }
  if (currency !== undefined && currency !== null && typeof currency !== "string") {
    return "currency must be a string";
  }
  return null;
}

async function GET(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    if (!/^\d+$/.test(String(providerId))) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderCapability(providerId, "walker");
    await requireProviderRole(providerId, userId, ALL_PROVIDER_ROLES);

    let packages;
    try {
      packages = await sql`
        SELECT id, provider_id, walks_count, price_cents, currency, active, created_at
        FROM walk_packages
        WHERE provider_id = ${providerId}
        ORDER BY active DESC, walks_count ASC, created_at ASC
      `;
    } catch (e) {
      if (isMissingTable(e)) return Response.json({ packages: [] });
      throw e;
    }

    return Response.json({ packages });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[GET /api/providers/[id]/walk-packages] Error:", e?.message);
    return Response.json({ error: "Failed to fetch walk packages" }, { status: 500 });
  }
}

async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const providerId = params.id;
    if (!/^\d+$/.test(String(providerId))) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    await requireProviderCapability(providerId, "walker");
    await requireProviderRole(providerId, userId);

    const body = (await request.json()) ?? {};
    const fieldError = invalidPackageFields(body);
    if (fieldError) {
      return Response.json({ error: fieldError }, { status: 400 });
    }

    const { walks_count, price_cents, currency, active } = body;
    const created = await sql`
      INSERT INTO walk_packages (provider_id, walks_count, price_cents, currency, active)
      VALUES (
        ${providerId}, ${walks_count}, ${price_cents},
        ${currency ?? "ARS"}, ${active === undefined ? true : active}
      )
      RETURNING id, provider_id, walks_count, price_cents, currency, active, created_at
    `;

    return Response.json({ package: created[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[POST /api/providers/[id]/walk-packages] Error:", e?.message);
    return Response.json({ error: "Failed to create walk package" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
