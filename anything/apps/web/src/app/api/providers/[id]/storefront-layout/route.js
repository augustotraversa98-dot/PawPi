import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { requireProviderRole, ProviderAuthError } from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";

// /api/providers/[id]/storefront-layout — set the per-provider storefront SECTION ORDER
// (Storefront Phase 2c-i, column added in 0077). Owner|admin only. The mobile shell + the
// web "view-as-customer" preview both read providers.storefront_section_order and validate it
// against the archetype's allowed sections (getStorefrontTabs); a NULL value clears the
// override → the archetype default. This route only WRITES the raw array; no editor UI here.
//
// DB is porsager's tagged-template `sql` (SCHEMA_NOTES "neon→porsager").

// The known storefront section keys (mirror of STOREFRONT_TAB_LABELS in
// provider/lib/storefrontTabs.js — kept in sync). Any other key is rejected (422).
const SECTION_KEYS = ["services", "items", "posts", "reviews", "locations", "about"];

async function PATCH(request, { params }) {
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

    await requireProviderRole(providerId, userId, ["owner", "admin"]);

    const body = (await request.json()) ?? {};
    const { section_order } = body;

    // section_order MUST be present: an array of known keys (no duplicates) OR null (clear).
    if (section_order === undefined) {
      return Response.json(
        { error: "section_order is required (an array of section keys, or null to clear)" },
        { status: 422 },
      );
    }
    if (section_order !== null) {
      if (!Array.isArray(section_order)) {
        return Response.json(
          { error: "section_order must be an array or null" },
          { status: 422 },
        );
      }
      const seen = new Set();
      for (const key of section_order) {
        if (!SECTION_KEYS.includes(key)) {
          return Response.json(
            { error: `Unknown section key: ${key}` },
            { status: 422 },
          );
        }
        if (seen.has(key)) {
          return Response.json(
            { error: `Duplicate section key: ${key}` },
            { status: 422 },
          );
        }
        seen.add(key);
      }
    }

    // RLS + the id filter scope the write to this provider's admin; a non-admin updates ZERO
    // rows (→ 404). null clears the override; an array is stored verbatim (text[]).
    const updated = await sql`
      UPDATE providers
      SET storefront_section_order = ${section_order}, updated_at = now()
      WHERE id = ${providerId}
      RETURNING id, storefront_section_order
    `;
    if (updated.length === 0) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    return Response.json({ section_order: updated[0].storefront_section_order });
  } catch (e) {
    if (e instanceof ProviderAuthError) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[PATCH /api/providers/[id]/storefront-layout] Error:", e?.message);
    return Response.json({ error: "Failed to update storefront layout" }, { status: 500 });
  }
}

const wrappedPATCH = withRequestContext(PATCH);
export { wrappedPATCH as PATCH };
