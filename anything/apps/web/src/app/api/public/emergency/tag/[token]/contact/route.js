import sql from "@/app/api/utils/sql";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { withRateLimit } from "@/app/api/utils/rateLimit";
import { sendEmergencyFinderPush } from "@/app/api/utils/emergencyPush";
import { composeFinderText, parseFinderSubmission } from "@/lib/publicPet/finder";

// POST /api/public/emergency/tag/[token]/contact — PUBLIC, NO AUTH (ticket 2.51). A stranger on
// the tag page writes to the owner WITHOUT seeing any owner data, leaving their own phone / email.
// Routed through the DEFINER fn app_emergency_finder_message (0146; only for relay-mode active
// cards). Answers { ok } only — a miss never says why, and nothing about the owner is returned.
//
// Body: { message, finderName?, finderPhone?, finderEmail? }. A body with any finder* key needs a
// valid phone or email (400 { ok:false, error }); an older page sends only `message`, still accepted.
// Database without 0146: falls back to the old relay with the contact written into the message text.
//
// DB is porsager's tagged-template `sql`.
async function handle(request, { params, afterCommit }) {
  try {
    const token = params.token;
    const body = (await request.json().catch(() => ({}))) ?? {};
    const { fields, error } = parseFinderSubmission(body);
    if (error) return Response.json({ ok: false, error }, { status: 400 });

    let result;
    try {
      // Savepoint: a database without 0146 must not abort the request transaction before the fallback.
      const rows = await withSavepoint(
        () => sql`
          SELECT app_emergency_finder_message(
            ${token}, ${fields.message}, ${fields.name}, ${fields.phone}, ${fields.email}
          ) AS result
        `,
      );
      result = rows[0]?.result ?? null;
    } catch (e) {
      if (e?.code !== "42883") throw e; // 42883 undefined_function = 0146 not applied yet
      const rows = await sql`SELECT app_emergency_relay_contact(${token}, ${composeFinderText(fields)}) AS ok`;
      return Response.json({ ok: rows[0]?.ok === true });
    }

    if (result?.delivered !== true) return Response.json({ ok: false });
    if (afterCommit) {
      afterCommit.push = {
        recipient: result.recipient_user_id,
        petId: result.pet_id,
        petName: result.pet_name,
        finder: fields,
        recentCount: result.recent_count,
      };
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/public/emergency/tag/[token]/contact] Error:", e?.message);
    // Never expose internals on the public page; report a soft failure.
    return Response.json({ ok: false });
  }
}

// #6: IP-keyed rate limit (public, no auth) — caps owner-notification spam from a scanned tag.
const inTransaction = withRequestContext(withRateLimit("emergency_relay", handle));

// The push goes out only once the message is committed (a failed commit answers 500: no push).
async function POST(request, context) {
  const afterCommit = {};
  const response = await inTransaction(request, { ...context, afterCommit });
  if (response.status === 200 && afterCommit.push) await sendEmergencyFinderPush(afterCommit.push);
  return response;
}

export { POST };
