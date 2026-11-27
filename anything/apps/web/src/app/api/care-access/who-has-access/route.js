import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { withRequestContext, withSavepoint } from "@/app/api/utils/requestContext";
import { RECORD_SECTIONS } from "@/app/api/utils/careAccess";
import { answer, isMissingSchema } from "@/app/api/utils/recordLink";

// GET /api/care-access/who-has-access → { entries }
//
// "Who has access" for the OWNER, across all their pets (docs/vet-sharing-design.md "Who has access"). The one source
// behind the count on My Hub and the list on Data Access, so the two cannot disagree: everything that can open a
// pet's data right now, one entry each.
//
//   kind            row                                  counted while
//   vet             care_access_grants                   active and not past its end
//   record_link     care_record_links                    not removed, not past its end, the pet still the owner's
//   emergency_link  pet_emergency_share_links            not revoked, not past its end, the emergency card active
//   family          pet_caregivers                       accepted (active) and not past its end
//
// Pending requests, unanswered invitations and unused invite codes open nothing and are not listed. No token and no
// link address is ever returned. A new way of sharing a pet's data has to be added here.

// The rows of one source, or none on a database that does not have it yet. Any other failure is thrown: part of the
// list must never pass for the whole of it.
async function source(kind, read) {
  try {
    const rows = await withSavepoint(async () => await read());
    return rows.map((row) => ({ kind, ...row }));
  } catch (error) {
    if (!isMissingSchema(error)) throw error;
    return [];
  }
}

// Edit permission is read through to_jsonb, so it is empty on a database that cannot store it yet.
const editSections = (value) =>
  RECORD_SECTIONS.filter((s) => Array.isArray(value) && value.includes(s));

// A grant by section opens nothing once the pet is someone else's (app_provider_has_section); a grant by scope does not
// look at that (app_provider_has_grant). `sections` is read through to_jsonb: without the column every grant is by scope.
const vetGrants = (userId) => sql`
  SELECT
    g.id,
    g.pet_id,
    p.name AS pet_name,
    g.provider_id,
    pr.name AS provider_name,
    g.scopes,
    to_jsonb(g) -> 'sections' AS sections,
    to_jsonb(g) -> 'edit_sections' AS edit_sections,
    g.granted_at,
    g.created_at,
    g.expires_at
  FROM care_access_grants g
  JOIN pets p ON p.id = g.pet_id
  LEFT JOIN providers pr ON pr.id = g.provider_id
  WHERE g.owner_user_id = ${userId}
    AND g.status = 'active'
    AND (g.expires_at IS NULL OR g.expires_at > now())
    AND (to_jsonb(g) ->> 'sections' IS NULL OR p.owner_user_id = g.owner_user_id)
  ORDER BY g.created_at DESC, g.id DESC
`;

const recordLinks = (userId) => sql`
  SELECT
    l.id,
    l.pet_id,
    p.name AS pet_name,
    l.sections,
    l.allow_notes,
    to_jsonb(l) -> 'edit_sections' AS edit_sections,
    l.created_at,
    l.expires_at
  FROM care_record_links l
  JOIN pets p ON p.id = l.pet_id AND p.owner_user_id = l.owner_user_id
  WHERE l.owner_user_id = ${userId}
    AND l.revoked_at IS NULL
    AND l.expires_at > now()
  ORDER BY l.created_at DESC, l.id DESC
`;

// The same conditions as the public reader (app_emergency_card_by_link).
const emergencyLinks = (userId) => sql`
  SELECT
    l.id,
    l.pet_id,
    p.name AS pet_name,
    l.scope,
    l.created_at,
    l.expires_at
  FROM pet_emergency_share_links l
  JOIN pet_emergency_cards c ON c.pet_id = l.pet_id AND c.active
  JOIN pets p ON p.id = l.pet_id
  WHERE l.owner_user_id = ${userId}
    AND l.revoked_at IS NULL
    AND (l.expires_at IS NULL OR l.expires_at > now())
  ORDER BY l.created_at DESC, l.id DESC
`;

const familyGrants = (userId) => sql`
  SELECT
    pc.id,
    pc.pet_id,
    p.name AS pet_name,
    pc.role,
    grantee.username AS grantee_username,
    pc.created_at,
    pc.expires_at
  FROM pet_caregivers pc
  JOIN pets p ON p.id = pc.pet_id
  JOIN user_profiles grantee ON grantee.id = pc.grantee_user_id
  WHERE pc.owner_user_id = ${userId}
    AND pc.status = 'active'
    AND (pc.expires_at IS NULL OR pc.expires_at > now())
  ORDER BY pc.created_at DESC, pc.id DESC
`;

async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Someone without a profile yet has no pet, so nothing is shared.
    const userId = await resolveUserId(session.user.id);
    if (userId === null) {
      return answer({ entries: [] });
    }

    // One after another: each runs in its own savepoint on the request transaction.
    const vets = await source("vet", () => vetGrants(userId));
    const links = await source("record_link", () => recordLinks(userId));
    const emergency = await source("emergency_link", () => emergencyLinks(userId));
    const family = await source("family", () => familyGrants(userId));

    const entries = [
      ...vets.map((v) => ({
        ...v,
        sections: v.sections ?? null,
        edit_sections: editSections(v.edit_sections),
      })),
      // A link that allows notes can add vet notes, whether or not the database lists what it can add.
      ...links.map((l) => ({
        ...l,
        edit_sections: editSections([
          ...(l.edit_sections ?? []),
          ...(l.allow_notes ? ["vet_notes"] : []),
        ]),
      })),
      ...emergency,
      ...family,
    ];

    return answer({ entries });
  } catch (error) {
    console.error("[GET /api/care-access/who-has-access] Error:", error.message);
    return Response.json({ error: "Failed to load who has access" }, { status: 500 });
  }
}

const wrappedGET = withRequestContext(GET);
export { wrappedGET as GET };
