import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { enforceRateLimit } from "@/app/api/utils/rateLimit";
import { resolveAppOrigin } from "@/app/api/utils/passwordResetToken";
import { RECORD_SECTIONS } from "@/app/api/utils/careAccess";
import { parseIdempotencyKey } from "@/app/api/utils/petCreateGuard";
import { findLinkByRequestKey, rememberLinkRequestKey } from "@/app/api/utils/recordLinkRequest";
import {
  RECORD_LINK_EXPIRIES,
  RECORD_LINK_OPEN_LIMIT,
  answer,
  hashLinkToken,
  isMissingSchema,
  newLinkToken,
  recordLinkUrl,
} from "@/app/api/utils/recordLink";

// The OWNER's record links (migration 0153, docs/vet-sharing-design.md "Record links"): whoever has one sees the chosen
// parts of the vet record without signing in. OWNER-context like /api/care-access/grants: only the pet's owner (not
// family members) creates one, and only sees their own. A path of its own, so an app asking a server that predates
// links gets "not found", never a different kind of link.

// GET /api/care-access/links?petId= → { available, links }, newest first. Never returns a token or a link address.
// `status`: 'active' | 'revoked' | 'expired'. `available` is false on a database without links.
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
    if (raw !== null && !/^\d{1,9}$/.test(raw)) {
      return Response.json({ error: "petId must be a number" }, { status: 400 });
    }
    const petId = raw === null ? null : Number(raw);

    let links;
    try {
      links = await withSavepoint(async () => {
        return await sql`
          SELECT
            l.id,
            l.pet_id,
            p.name AS pet_name,
            l.sections,
            l.allow_notes,
            CASE
              WHEN l.revoked_at IS NOT NULL THEN 'revoked'
              WHEN l.expires_at <= now() OR p.owner_user_id IS DISTINCT FROM l.owner_user_id THEN 'expired'
              ELSE 'active'
            END AS status,
            l.created_at,
            l.expires_at,
            l.revoked_at
          FROM care_record_links l
          LEFT JOIN pets p ON p.id = l.pet_id
          WHERE l.owner_user_id = ${userId}
            AND (${petId}::int IS NULL OR l.pet_id = ${petId}::int)
          ORDER BY (l.revoked_at IS NULL AND l.expires_at > now()) DESC, l.created_at DESC, l.id DESC
          LIMIT 50
        `;
      });
    } catch (error) {
      if (!isMissingSchema(error)) throw error;
      return answer({ available: false, links: [] });
    }

    return answer({ available: true, links });
  } catch (error) {
    console.error("[GET /api/care-access/links] Error:", error.message);
    return Response.json({ error: "Failed to fetch links" }, { status: 500 });
  }
}

// Why a body is refused, or null when it is a complete choice.
function invalidChoice({ sections, expiry, allowNotes }) {
  if (
    !Array.isArray(sections) ||
    sections.length === 0 ||
    new Set(sections).size !== sections.length ||
    !sections.every((s) => RECORD_SECTIONS.includes(s))
  ) {
    return "sections must be a non-empty array of different valid section keys";
  }
  if (typeof expiry !== "string" || !Object.hasOwn(RECORD_LINK_EXPIRIES, expiry)) {
    return `expiry must be one of ${Object.keys(RECORD_LINK_EXPIRIES).join(", ")}`;
  }
  if (typeof allowNotes !== "boolean") {
    return "allowNotes must be true or false";
  }
  return null;
}

// POST /api/care-access/links { petId, sections, expiry, allowNotes } → 201 { link, url }. Every part of the choice is
// required. The address is returned here and never again. With an Idempotency-Key header, a repeat of a request that
// already created a link creates nothing: 409 'link_already_created' { linkId }.
//   409 'link_limit' (at most RECORD_LINK_OPEN_LIMIT links in use per owner) · 409 'share_links_unavailable' · 429
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

    const limited = await enforceRateLimit("record_link_create", request, { userId });
    if (limited) return limited;

    const body = (await request.json().catch(() => null)) ?? {};
    const petId = Number(body.petId);
    if (!Number.isInteger(petId) || petId <= 0 || petId > 2147483647) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }
    const refused = invalidChoice(body);
    if (refused) {
      return Response.json({ error: refused }, { status: 400 });
    }
    const sections = RECORD_SECTIONS.filter((s) => body.sections.includes(s));
    const requestKey = parseIdempotencyKey(request.headers.get("idempotency-key"));
    if (requestKey.error) {
      return Response.json({ error: requestKey.error, code: "idempotency_key_invalid" }, { status: 400 });
    }

    const petRows = await sql`
      SELECT id FROM pets WHERE id = ${petId} AND owner_user_id = ${userId}
    `;
    if (petRows.length === 0) {
      return Response.json({ error: "Pet not found" }, { status: 404 });
    }

    const token = newLinkToken();
    let created;
    try {
      created = await withSavepoint(async () => {
        // One creation at a time per owner, so the limit holds under concurrent requests.
        await sql`SELECT pg_advisory_xact_lock(hashtext(${`care_record_link:${userId}`}))`;
        if (requestKey.key) {
          const earlier = await findLinkByRequestKey(userId, requestKey.key);
          if (earlier !== null) return { earlier };
        }
        const open = await sql`
          SELECT count(*)::int AS n FROM care_record_links
          WHERE owner_user_id = ${userId}
            AND revoked_at IS NULL
            AND expires_at > now()
        `;
        if (open[0].n >= RECORD_LINK_OPEN_LIMIT) return null;
        const rows = await sql`
          INSERT INTO care_record_links (pet_id, owner_user_id, token_hash, sections, allow_notes, expires_at)
          VALUES (
            ${petId},
            ${userId},
            ${hashLinkToken(token)},
            ${sections},
            ${body.allowNotes},
            now() + ${RECORD_LINK_EXPIRIES[body.expiry]}::interval
          )
          RETURNING id, pet_id, sections, allow_notes, created_at, expires_at
        `;
        if (requestKey.key) await rememberLinkRequestKey(userId, requestKey.key, rows[0].id);
        return rows[0];
      });
    } catch (error) {
      if (!isMissingSchema(error)) throw error;
      return answer(
        { error: "Sharing by link is not available yet", code: "share_links_unavailable" },
        409,
      );
    }
    if (created?.earlier !== undefined) {
      return answer(
        {
          error: "This link was already created. Its address cannot be shown again.",
          code: "link_already_created",
          linkId: created.earlier,
        },
        409,
      );
    }
    if (created === null) {
      return answer(
        {
          error: "You have too many links in use. Remove one to create another.",
          code: "link_limit",
          limit: RECORD_LINK_OPEN_LIMIT,
        },
        409,
      );
    }

    return answer(
      {
        link: { ...created, status: "active" },
        url: recordLinkUrl(resolveAppOrigin(request), token),
      },
      201,
    );
  } catch (error) {
    console.error("[POST /api/care-access/links] Error:", error.message);
    return Response.json({ error: "Failed to create link" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
const wrappedPOST = withRequestContext(POST);
export { wrappedGET as GET, wrappedPOST as POST };
