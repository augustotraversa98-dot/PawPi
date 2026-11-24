import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { notifyPetShare, actorDisplayName } from "@/app/api/utils/petShareNotify";

// The OWNER resends / refreshes a PENDING invite (family-sharing PR 4/7): the invitee is told again (bell + optional push) and, optionally,
// the access window is extended (`expiresAt`, a future moment). Rate-limited so it cannot be used to spam someone:
//   at most one resend per RESEND_MIN_INTERVAL, at most RESEND_MAX per invite — enforced atomically in the UPDATE itself, so two parallel taps
//   cannot both pass. Anything else answers a friendly code:
//   not the owner's grant -> 404 `grant_not_found` · not pending (accepted / declined / ended) -> 409 `invite_not_pending`
//   too soon -> 429 `resend_too_soon` (+ retry_after_seconds) · limit reached -> 429 `resend_limit`
//   past/garbled expiresAt -> 400 `invalid_expiry` · migration 0142 not applied -> 503 `sharing_lifecycle_unavailable`

const RESEND_MIN_INTERVAL_SECONDS = 3600;
const RESEND_MAX = 5;

async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = await resolveUserId(session.user.id);
    if (!userId) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const grantId = parseInt(params.id);
    if (!Number.isInteger(grantId)) {
      return Response.json({ error: "Invalid grant" }, { status: 400 });
    }
    const body = await request.json().catch(() => ({}));
    let newExpiry = null;
    if (body?.expiresAt != null) {
      const when = new Date(body.expiresAt);
      if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
        return Response.json({ error: "Pick an expiry date in the future.", code: "invalid_expiry" }, { status: 400 });
      }
      newExpiry = when.toISOString();
    }

    const found = await sql`
      SELECT pc.id, pc.status, pc.grantee_user_id, pc.pet_id, p.name AS pet_name
      FROM pet_caregivers pc
      JOIN pets p ON p.id = pc.pet_id
      WHERE pc.id = ${grantId} AND pc.owner_user_id = ${userId}
    `;
    if (found.length === 0) {
      return Response.json({ error: "We couldn't find that invitation.", code: "grant_not_found" }, { status: 404 });
    }
    const g = found[0];
    if (g.status !== "pending") {
      return Response.json({ error: "That invitation was already answered or ended.", code: "invite_not_pending" }, { status: 409 });
    }

    let updated;
    try {
      updated = await withSavepoint(
        () => sql`
          UPDATE pet_caregivers
          SET last_notified_at = now(),
              resend_count = resend_count + 1,
              updated_at = now(),
              expires_at = COALESCE(${newExpiry}::timestamptz, expires_at)
          WHERE id = ${grantId} AND owner_user_id = ${userId} AND status = 'pending'
            AND (last_notified_at IS NULL OR last_notified_at <= now() - make_interval(secs => ${RESEND_MIN_INTERVAL_SECONDS}))
            AND resend_count < ${RESEND_MAX}
          RETURNING id, resend_count, expires_at, last_notified_at
        `,
      );
    } catch (e) {
      if (e?.code === "42703") {
        return Response.json(
          { error: "Resending invitations isn't available yet. Please try again later.", code: "sharing_lifecycle_unavailable" },
          { status: 503 },
        );
      }
      throw e;
    }

    if (updated.length === 0) {
      const [cur] = await sql`
        SELECT resend_count, last_notified_at FROM pet_caregivers WHERE id = ${grantId} AND owner_user_id = ${userId}
      `;
      if ((cur?.resend_count ?? 0) >= RESEND_MAX) {
        return Response.json(
          { error: "You've resent this invitation enough times. Ask them to check PawPi, or send a new invitation.", code: "resend_limit" },
          { status: 429 },
        );
      }
      const since = cur?.last_notified_at ? (Date.now() - new Date(cur.last_notified_at).getTime()) / 1000 : 0;
      return Response.json(
        {
          error: "You just sent this invitation. Please wait a little before resending.",
          code: "resend_too_soon",
          retry_after_seconds: Math.max(1, Math.ceil(RESEND_MIN_INTERVAL_SECONDS - since)),
        },
        { status: 429 },
      );
    }

    await sql`
      INSERT INTO pet_caregiver_audit (grant_id, owner_user_id, actor_user_id, action)
      VALUES (${grantId}, ${userId}, ${userId}, 'resend')
    `;
    await notifyPetShare({
      type: "pet_share_invite",
      recipient: g.grantee_user_id,
      actor: userId,
      petId: g.pet_id,
      petName: g.pet_name,
      actorName: await actorDisplayName(userId),
    });

    return Response.json({ ok: true, ...updated[0] });
  } catch (error) {
    console.error("[POST /api/pet-caregivers/[id]/resend] Error:", error.message);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
