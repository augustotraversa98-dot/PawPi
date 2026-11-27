// Changing what an existing share opens, on the same share (migration 0159, docs/vet-sharing-design.md "Editing a
// share"): the parts, what the vet may add to, and optionally the end date. Nothing is removed and recreated, so access
// never has a gap. Only the pet's owner; widening is possible, so edits count against the sharing limit.

import sql from "./sql";
import { withSavepoint } from "./requestContext";
import { enforceRateLimit } from "./rateLimit";
import { RECORD_SECTIONS, SHARE_EXPIRY_INTERVALS } from "./careAccess";
import { notifyCareAccess } from "./careAccessNotify";
import {
  editAccessSupported,
  editAccessUnavailable,
  parseEditSections,
  sameSections,
} from "./editAccess";
import { RECORD_LINK_EXPIRIES, answer, isMissingSchema } from "./recordLink";
import { withdrawOpenOffer } from "./shareOffers";

// "keep" leaves the end date as it is.
const KEEP = "keep";

// The whole choice or why it is refused. `expiries` are the lengths this kind of share can have.
function parseChoice(body, expiries, options) {
  const { sections, editSections, expiry } = body;
  if (
    !Array.isArray(sections) ||
    sections.length === 0 ||
    new Set(sections).size !== sections.length ||
    !sections.every((s) => RECORD_SECTIONS.includes(s))
  ) {
    return { error: "sections must be a non-empty array of different valid section keys" };
  }
  // Required: an edit never keeps or drops a permission by omission.
  if (editSections === undefined) return { error: "editSections is required" };
  const edit = parseEditSections(editSections, sections, options);
  if (edit.error) return { error: edit.error };
  if (expiry !== KEEP && !(typeof expiry === "string" && Object.hasOwn(expiries, expiry))) {
    return { error: `expiry must be one of ${[KEEP, ...Object.keys(expiries)].join(", ")}` };
  }
  return {
    sections: RECORD_SECTIONS.filter((s) => sections.includes(s)),
    editSections: edit.value,
    expiry,
  };
}

const refuse = (status, code, error) => Response.json({ error, code }, { status });

/** PATCH /api/care-access/grants/[grantId] { action: 'update', sections, editSections, expiry } → 200 { grant } */
export async function updateGrantShare({ request, grantId, userId, body }) {
  const limited = await enforceRateLimit("care_share", request, { userId });
  if (limited) return limited;

  const choice = parseChoice(body, SHARE_EXPIRY_INTERVALS);
  if (choice.error) return Response.json({ error: choice.error }, { status: 400 });

  if (!/^\d{1,9}$/.test(String(grantId))) return Response.json({ error: "Grant not found" }, { status: 404 });
  const found = await sql`
    SELECT * FROM care_access_grants
    WHERE id = ${grantId} AND owner_user_id = ${userId}
    LIMIT 1
  `;
  const before = found[0];
  if (!before) return Response.json({ error: "Grant not found" }, { status: 404 });
  if (!before.sections) {
    return refuse(409, "grant_not_editable", "This older access cannot be edited. Remove it and share the parts you choose.");
  }

  const supported = await editAccessSupported();
  if (choice.editSections.length > 0 && !supported) return editAccessUnavailable();

  const { pet_id: petId, provider_id: providerId } = before;
  // One change at a time per pet and business: the lock a share and an answer to an invitation take too.
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`care_access_grant:${petId}:${providerId}`}))`;
  const keep = choice.expiry === KEEP;
  const interval = keep ? null : SHARE_EXPIRY_INTERVALS[choice.expiry];
  // The parts and the permission change in one statement: a permission is never wider than the parts. Whether the
  // permission is written depends on the row having it, not on whether adding works yet, so "view only" always removes
  // a permission the access already carries.
  const stored = before.edit_sections !== undefined;
  const updated = stored
    ? await sql`
        UPDATE care_access_grants
        SET sections = ${choice.sections},
            edit_sections = ${choice.editSections},
            expires_at = CASE WHEN ${keep}::boolean THEN expires_at ELSE NOW() + ${interval}::interval END,
            updated_at = NOW()
        WHERE id = ${grantId} AND owner_user_id = ${userId}
          AND status = 'active' AND sections IS NOT NULL
          AND (expires_at IS NULL OR expires_at > now())
          AND pet_id IN (SELECT id FROM pets WHERE owner_user_id = ${userId})
        RETURNING *
      `
    : await sql`
        UPDATE care_access_grants
        SET sections = ${choice.sections},
            expires_at = CASE WHEN ${keep}::boolean THEN expires_at ELSE NOW() + ${interval}::interval END,
            updated_at = NOW()
        WHERE id = ${grantId} AND owner_user_id = ${userId}
          AND status = 'active' AND sections IS NOT NULL
          AND (expires_at IS NULL OR expires_at > now())
          AND pet_id IN (SELECT id FROM pets WHERE owner_user_id = ${userId})
        RETURNING *
      `;
  const grant = updated[0];
  if (!grant) return refuse(409, "grant_not_active", "This access has ended");

  // The owner's later decision wins over an invitation still waiting.
  await withdrawOpenOffer({ userId, petId, providerId });
  const changed =
    !keep ||
    !sameSections(before.sections, grant.sections) ||
    !sameSections(before.edit_sections, grant.edit_sections);
  if (changed) {
    await notifyCareAccess({ type: "care_access_granted", grant, actor: userId, changed: true });
  }
  return Response.json({ grant });
}

/** PATCH /api/care-access/links/[linkId] { action: 'update', sections, editSections, expiry } → 200 { link } */
export async function updateLinkShare({ request, linkId, userId, body }) {
  const limited = await enforceRateLimit("care_share", request, { userId });
  if (limited) return limited;

  const choice = parseChoice(body, RECORD_LINK_EXPIRIES, { notesWithoutView: true });
  if (choice.error) return Response.json({ error: choice.error }, { status: 400 });

  let rows;
  try {
    rows = await withSavepoint(async () => {
      return await sql`
        SELECT outcome, id, pet_id, sections, allow_notes, edit_sections, created_at, expires_at
        FROM app_update_record_link(
          ${linkId}::int, ${choice.sections}::text[], ${choice.editSections}::text[],
          ${choice.expiry === KEEP ? null : choice.expiry}::text)
      `;
    });
  } catch (error) {
    if (!isMissingSchema(error)) throw error;
    return editAccessUnavailable();
  }
  const { outcome, ...link } = rows[0] ?? {};
  if (outcome === "not_active") return refuse(409, "link_not_active", "This link has ended");
  if (outcome !== "updated") return Response.json({ error: "Link not found" }, { status: 404 });
  return answer({ link: { ...link, status: "active" } });
}
