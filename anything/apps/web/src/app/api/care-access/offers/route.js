import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { enforceRateLimit } from "@/app/api/utils/rateLimit";
import { RECORD_SECTIONS, SHARE_EXPIRY_INTERVALS } from "@/app/api/utils/careAccess";
import { notifyShareOffered } from "@/app/api/utils/careAccessNotify";
import {
  SHARE_OFFER_OPEN_LIMIT,
  isMissingSchema,
  offersUnavailable,
  presentOffer,
  toId,
} from "@/app/api/utils/shareOffers";

// The OWNER's invitations to vets on PawPi (migration 0154, docs/vet-sharing-design.md "Invitations to a vet on
// PawPi"). An invitation shares nothing: the invited business accepts or declines it
// (/api/providers/[id]/share-offers). OWNER-context: only the pet's owner (not family members) invites.

// GET /api/care-access/offers?petId= → { available, offers }, unanswered ones first. `status` is the EFFECTIVE one:
// 'open' | 'accepted' | 'declined' | 'withdrawn' | 'lapsed'.
async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const raw = new URL(request.url).searchParams.get("petId");
    if (raw !== null && toId(raw) === null) {
      return Response.json({ error: "petId must be a number" }, { status: 400 });
    }
    const petId = raw === null ? null : toId(raw);

    let offers;
    try {
      offers = await withSavepoint(async () => {
        return await sql`
          SELECT
            o.id,
            o.pet_id,
            p.name AS pet_name,
            o.provider_id,
            pr.name AS provider_name,
            o.sections,
            o.duration,
            eff.status,
            o.created_at,
            o.lapses_at,
            o.responded_at
          FROM care_share_offers o
          LEFT JOIN pets p ON p.id = o.pet_id
          LEFT JOIN providers pr ON pr.id = o.provider_id
          CROSS JOIN LATERAL (
            SELECT CASE
              WHEN o.status = 'open'
                AND (o.lapses_at <= now() OR p.owner_user_id IS DISTINCT FROM o.owner_user_id) THEN 'lapsed'
              ELSE o.status
            END AS status
          ) eff
          WHERE o.owner_user_id = ${userId}
            AND (${petId}::int IS NULL OR o.pet_id = ${petId}::int)
          ORDER BY (eff.status = 'open') DESC, o.created_at DESC, o.id DESC
          LIMIT 50
        `;
      });
    } catch (error) {
      if (!isMissingSchema(error)) throw error;
      return Response.json({ available: false, offers: [] });
    }

    return Response.json({ available: true, offers: offers.map(presentOffer) });
  } catch (error) {
    console.error("[GET /api/care-access/offers] Error:", error.message);
    return Response.json({ error: "Failed to fetch invitations" }, { status: 500 });
  }
}

// Why a body is refused, or null when it is a complete choice.
function invalidChoice({ sections, expiry }) {
  if (
    !Array.isArray(sections) ||
    sections.length === 0 ||
    new Set(sections).size !== sections.length ||
    !sections.every((s) => RECORD_SECTIONS.includes(s))
  ) {
    return "sections must be a non-empty array of different valid section keys";
  }
  if (typeof expiry !== "string" || !Object.hasOwn(SHARE_EXPIRY_INTERVALS, expiry)) {
    return `expiry must be one of ${Object.keys(SHARE_EXPIRY_INTERVALS).join(", ")}`;
  }
  return null;
}

const openOffer = async ({ userId, petId, providerId }) => {
  const rows = await sql`
    SELECT o.id, o.pet_id, o.provider_id, o.sections, o.duration, o.status, o.created_at, o.lapses_at, o.responded_at
    FROM care_share_offers o
    WHERE o.owner_user_id = ${userId}
      AND o.pet_id = ${petId}
      AND o.provider_id = ${providerId}
      AND o.status = 'open'
    LIMIT 1
  `;
  return rows[0] ?? null;
};

// The unanswered invitation already there answers a repeated send with the same choice; a different one is refused, so
// the owner is never told something was sent that was not.
function answerExisting(offer, { sections, expiry }) {
  const same =
    offer.duration === expiry &&
    offer.sections.length === sections.length &&
    sections.every((s) => offer.sections.includes(s));
  if (same) return Response.json({ offer: presentOffer(offer), deduped: true });
  return Response.json(
    {
      error: "An invitation with a different choice is waiting for this business. Withdraw it to send a new one.",
      code: "offer_open",
      offer: presentOffer(offer),
    },
    { status: 409 },
  );
}

// POST /api/care-access/offers { petId, providerId, sections, expiry } → 201 { offer }
//   200 { offer, deduped: true } the same invitation is already waiting
//   409 'offer_open' one with a different choice is waiting · 'offer_limit' · 'share_offers_unavailable'
//   404 not the owner's pet, or a business that cannot be invited · 400 · 429
async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const limited = await enforceRateLimit("share_offer_create", request, { userId });
    if (limited) return limited;

    const body = (await request.json().catch(() => null)) ?? {};
    const petId = toId(body.petId);
    const providerId = toId(body.providerId);
    if (petId === null || providerId === null) {
      return Response.json({ error: "petId and providerId are required" }, { status: 400 });
    }
    const refused = invalidChoice(body);
    if (refused) {
      return Response.json({ error: refused }, { status: 400 });
    }
    const choice = {
      sections: RECORD_SECTIONS.filter((s) => body.sections.includes(s)),
      expiry: body.expiry,
    };

    const petRows = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (petRows.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }

    let result;
    try {
      result = await withSavepoint(async () => {
        const eligible = await sql`SELECT app_vet_can_receive_share(${providerId}::int) AS ok`;
        if (!eligible[0]?.ok) return { missing: true };

        // One change at a time per pet and business: the lock a share and an answer take too.
        await sql`SELECT pg_advisory_xact_lock(hashtext(${`care_access_grant:${petId}:${providerId}`}))`;
        await sql`SELECT app_lapse_share_offers(${petId}::int, ${providerId}::int)`;
        const waiting = await openOffer({ userId, petId, providerId });
        if (waiting) return { waiting };

        // One owner at a time, so the limit holds under concurrent requests.
        await sql`SELECT pg_advisory_xact_lock(hashtext(${`care_share_offer:${userId}`}))`;
        const open = await sql`
          SELECT count(*)::int AS n FROM care_share_offers
          WHERE owner_user_id = ${userId} AND status = 'open' AND lapses_at > now()
        `;
        if (open[0].n >= SHARE_OFFER_OPEN_LIMIT) return { full: true };

        const created = await sql`
          INSERT INTO care_share_offers (pet_id, owner_user_id, provider_id, sections, duration)
          VALUES (${petId}, ${userId}, ${providerId}, ${choice.sections}, ${choice.expiry})
          RETURNING id, pet_id, provider_id, sections, duration, status, created_at, lapses_at, responded_at
        `;
        return { created: created[0] };
      });
    } catch (error) {
      if (!isMissingSchema(error)) throw error;
      return offersUnavailable();
    }

    if (result.missing) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }
    if (result.waiting) return answerExisting(result.waiting, choice);
    if (result.full) {
      return Response.json(
        {
          error: "You have too many invitations waiting. Withdraw one to send another.",
          code: "offer_limit",
          limit: SHARE_OFFER_OPEN_LIMIT,
        },
        { status: 409 },
      );
    }

    await notifyShareOffered({ providerId, petId, actor: userId });
    return Response.json({ offer: presentOffer(result.created) }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/care-access/offers] Error:", error.message);
    return Response.json({ error: "Failed to send the invitation" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
