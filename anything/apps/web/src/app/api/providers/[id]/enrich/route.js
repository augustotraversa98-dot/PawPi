import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { requireProviderRole, ProviderAuthError } from "@/app/api/utils/providerAuth";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { buildEnrichmentDraft } from "@/app/api/utils/enrichment";
import {
  EnrichmentNotConfiguredError,
  isEnrichmentConfigured,
} from "@/app/api/utils/enrichment/config";

// POST /api/providers/[id]/enrich — CONFIRM-FIRST enrichment (Phase 2 ticket 2.21).
//
// owner|admin taps "Import from the web"; we read this provider's stored links (2.20) and
// return a PROPOSED draft (description, candidate services, address/phone/hours/photos from
// Google Places). It NEVER writes providers/locations/services — the provider reviews the
// draft and applies it through the EXISTING owner-identity save routes (profile PATCH,
// locations/services CRUD), so RLS + validation always apply. Unverified data never goes live.
//
// Dormant behind keys: no enrichment key configured → clean 503 ("not set up yet"), no crash.
// Best-effort per source: one failing source returns its status, not a 500.
async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const providerId = params.id;
    // owner|admin only — same gate as the profile PATCH the provider applies the draft through.
    await requireProviderRole(providerId, userId);

    // Dormant: refuse cleanly when no source is configured (don't server-fetch with nothing).
    if (!isEnrichmentConfigured()) {
      throw new EnrichmentNotConfiguredError();
    }

    // Read the provider's links (the enrichment INPUT). Read-only.
    const rows = await sql`
      SELECT id, name, website_url, instagram_url, facebook_url, google_maps_url
      FROM providers WHERE id = ${providerId} LIMIT 1
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    const { draft, sources } = await buildEnrichmentDraft(rows[0]);

    // PROPOSAL ONLY — the caller reviews + applies via the existing save routes.
    return Response.json({ draft, sources, applied: false });
  } catch (e) {
    if (e instanceof EnrichmentNotConfiguredError || e.status === 503) {
      return Response.json({ error: e.message }, { status: 503 });
    }
    if (e instanceof ProviderAuthError || e.status === 403) {
      return Response.json({ error: e.message }, { status: e.status ?? 403 });
    }
    console.error("[POST /api/providers/[id]/enrich] Error:", e?.message);
    return Response.json({ error: "Failed to enrich" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
