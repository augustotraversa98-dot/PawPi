import sql from "@/app/api/utils/sql";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { enforceRateLimit } from "@/app/api/utils/rateLimit";
import { anonymousSender, senderForToken } from "@/app/api/utils/senderAddress";
import { sendEmergencyFinderPush } from "@/app/api/utils/emergencyPush";
import { composeFinderText, parseFinderSubmission } from "@/lib/publicPet/finder";

// POST /api/public/emergency/tag/[token]/contact — PUBLIC, NO AUTH (ticket 2.51). A stranger on
// the tag page writes to the family WITHOUT seeing any owner data, leaving their own phone / email.
// Routed through the DEFINER fn app_emergency_finder_message (0146; only for active cards that take
// messages: relay, or phone / email with nothing saved). Answers { ok } only — a miss never says why,
// and nothing about the owner or the family is returned.
//
// Body: { message, finderName?, finderPhone?, finderEmail? }. A body with any finder* key needs a
// valid phone or email (400 { ok:false, error }); an older page sends only `message`, still accepted.
// Database without 0146: falls back to the old relay with the contact written into the message text.
//
// ABUSE (docs/emergency-finder.md): per sender here (short window + daily cap → 429, and one urgent
// push per sender per tag per day); per pet inside the database function, whatever the sender claims.
//
// DB is porsager's tagged-template `sql`.

const SENDER_LIMITS = ["emergency_relay", "emergency_relay_daily"];

async function handle(request, { params, afterCommit }) {
  try {
    const token = params.token;
    const body = (await request.json().catch(() => ({}))) ?? {};
    const { fields, error } = parseFinderSubmission(body);
    if (error) return Response.json({ ok: false, error }, { status: 400 });

    const sender = anonymousSender(request);
    let allowUrgent = true;
    if (sender) {
      for (const bucket of SENDER_LIMITS) {
        const limited = await enforceRateLimit(bucket, request, { subject: sender });
        if (limited) return limited;
      }
      // Over this one the message is still delivered, only not as an urgent notification.
      allowUrgent =
        (await enforceRateLimit("emergency_relay_urgent", request, {
          subject: senderForToken(sender, token),
          soft: true,
        })) === null;
    }

    let result;
    try {
      // Savepoint: a database without 0146 must not abort the request transaction before the fallback.
      const rows = await withSavepoint(
        () => sql`
          SELECT app_emergency_finder_message(
            ${token}, ${fields.message}, ${fields.name}, ${fields.phone}, ${fields.email}, ${allowUrgent}
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
        members: result.member_user_ids ?? [],
        petId: result.pet_id,
        petName: result.pet_name,
        finder: fields,
        urgent: result.urgent === true,
      };
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/public/emergency/tag/[token]/contact] Error:", e?.message);
    // Never expose internals on the public page; report a soft failure.
    return Response.json({ ok: false });
  }
}

const inTransaction = withRequestContext(handle);

// The push goes out only once the message is committed (a failed commit answers 500: no push).
async function POST(request, context) {
  const afterCommit = {};
  const response = await inTransaction(request, { ...context, afterCommit });
  if (response.status === 200 && afterCommit.push) await sendEmergencyFinderPush(afterCommit.push);
  return response;
}

export { POST };
