import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveOrCreateUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { withRateLimit } from "@/app/api/utils/rateLimit";
import { notifyPetShare, actorDisplayName } from "@/app/api/utils/petShareNotify";
import { normalizeInviteCode, hashInviteCode } from "@/app/api/utils/inviteCodes";

// POST { code } — a signed-in person uses an invite code and gets access to that one pet at once
// (docs/pr6-invite-code-design.md). The code travels only in this request body and is never logged.
// A brand-new account (no profile yet) can redeem: that is the Apple "Hide My Email" case.

const ANSWERS = {
  invalid: [404, "That code doesn't work. Check it and try again."],
  expired: [410, "That code has expired. Ask for a new one."],
  revoked: [410, "That code was cancelled. Ask for a new one."],
  used: [409, "That code was already used. Ask for a new one."],
  own_pet: [409, "That's a code for your own dog."],
  already_member: [409, "You already have access to this dog."],
};
const answer = (result, extra = {}) => {
  const [status, error] = ANSWERS[result] ?? ANSWERS.invalid;
  return Response.json({ error, code: `invite_${result}`, ...extra }, { status });
};

async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const userId = await resolveOrCreateUserId(session);
    if (!userId) return Response.json({ error: "User profile not found" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const canonical = normalizeInviteCode(body?.code);
    if (!canonical) return answer("invalid");

    let outcome;
    try {
      const rows = await withSavepoint(
        () => sql`SELECT app_redeem_pet_invite(${hashInviteCode(canonical)}) AS outcome`,
      );
      outcome = rows[0]?.outcome;
    } catch (e) {
      if (e?.code === "42883" || e?.code === "42P01") {
        return Response.json(
          { error: "Invite codes aren't available yet. Please try again later.", code: "invite_codes_unavailable" },
          { status: 503 },
        );
      }
      throw e;
    }

    if (outcome?.result !== "ok") {
      return answer(outcome?.result, outcome?.pet_id ? { pet_id: outcome.pet_id } : {});
    }

    await notifyPetShare({
      type: "pet_share_accepted",
      recipient: outcome.owner_user_id,
      actor: userId,
      petId: outcome.pet_id,
      petName: outcome.pet_name,
      actorName: await actorDisplayName(userId),
    });
    return Response.json({
      ok: true,
      pet_id: outcome.pet_id,
      pet_name: outcome.pet_name,
      role: outcome.role,
    });
  } catch (error) {
    console.error("[POST /api/pet-invite-codes/redeem] Error:", error.message);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(withRateLimit("invite_redeem", POST));
export { wrappedPOST as POST };
