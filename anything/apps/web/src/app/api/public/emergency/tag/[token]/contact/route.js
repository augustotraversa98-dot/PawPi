import sql from "@/app/api/utils/sql";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/public/emergency/tag/[token]/contact — PUBLIC, NO AUTH (ticket 2.51). A stranger on
// the tag page relays a message to the owner WITHOUT seeing any owner data. Routed through the
// DEFINER fn app_emergency_relay_contact (best-effort app_notify; only for relay-mode active
// cards). Always returns 200 with { ok } — a relay miss/notify failure never leaks why.
//
// DB is porsager's tagged-template `sql`.
async function POST(request, { params }) {
  try {
    const token = params.token;
    const body = (await request.json().catch(() => ({}))) ?? {};
    const message = typeof body.message === "string" ? body.message.slice(0, 500) : "";
    const rows = await sql`SELECT app_emergency_relay_contact(${token}, ${message}) AS ok`;
    return Response.json({ ok: rows[0]?.ok === true });
  } catch (e) {
    console.error("[POST /api/public/emergency/tag/[token]/contact] Error:", e?.message);
    // Never expose internals on the public page; report a soft failure.
    return Response.json({ ok: false });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
