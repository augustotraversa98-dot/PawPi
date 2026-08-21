import sql from "@/app/api/utils/sql";
import { withRequestContext } from "@/app/api/utils/requestContext";

// GET /api/public/emergency/card/[token] — PUBLIC, NO AUTH (ticket 2.51). The revocable vet
// link. Data SOLELY through the SECURITY DEFINER fn app_emergency_card_by_link, which returns the
// scoped card (full|basic) only for a non-revoked, non-expired link on an active card; a
// revoked/expired/unknown token → 404 so the page can show "link no longer valid" cleanly.
//
// DB is porsager's tagged-template `sql`.
async function GET(request, { params }) {
  try {
    const token = params.token;
    const rows = await sql`SELECT app_emergency_card_by_link(${token}) AS card`;
    const card = rows[0]?.card ?? null;
    if (!card) {
      return Response.json({ error: "expired_or_revoked" }, { status: 404 });
    }
    // This is an UNAUTHENTICATED response carrying pet PII (name, photo, microchip, and — when
    // the owner shared a full-scope link — allergies/conditions/vet + emergency contacts). Never
    // let a shared/CDN/proxy cache retain it, and don't let a revoked link linger in a cache.
    return Response.json(
      { card },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (e) {
    console.error("[GET /api/public/emergency/card/[token]] Error:", e?.message);
    return Response.json({ error: "Failed to load card" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
