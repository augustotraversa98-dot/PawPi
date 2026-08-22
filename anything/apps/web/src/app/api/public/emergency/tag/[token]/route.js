import sql from "@/app/api/utils/sql";
import { withRequestContext } from "@/app/api/utils/requestContext";
import { withRateLimit } from "@/app/api/utils/rateLimit";

// GET /api/public/emergency/tag/[token] — PUBLIC, NO AUTH (ticket 2.51). The permanent printed
// tag. The data comes SOLELY through the SECURITY DEFINER function app_emergency_card_by_tag,
// which whitelists BASIC fields (+ medical ONLY when the owner enabled show_medical_on_tag) for
// an ACTIVE card. No login, no app-install wall. Wrapped in withRequestContext like every
// DB-touching route; for an anonymous caller no identity is set (the DEFINER fn doesn't need it).
//
// DB is porsager's tagged-template `sql`.
async function GET(request, { params }) {
  try {
    const token = params.token;
    const rows = await sql`SELECT app_emergency_card_by_tag(${token}) AS card`;
    const card = rows[0]?.card ?? null;
    if (!card) {
      return Response.json({ error: "not_available" }, { status: 404 });
    }
    // Unauthenticated response carrying pet PII (basic fields, plus medical ONLY when the owner
    // opted in via show_medical_on_tag). Never let a shared/CDN/proxy cache retain it.
    return Response.json(
      { card },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (e) {
    console.error("[GET /api/public/emergency/tag/[token]] Error:", e?.message);
    return Response.json({ error: "Failed to load tag" }, { status: 500 });
  }
}

// #6: IP-keyed rate limit (public, no auth) — defense-in-depth against blind token probing.
const wrappedGET = withRequestContext(withRateLimit("emergency_public_read", GET));
export { wrappedGET as GET };
