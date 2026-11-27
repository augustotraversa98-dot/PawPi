// A business adding to an owner's vet record (migration 0160, docs/vet-sharing-design.md "What a vet can add").
//
// The database decides what may be written (app_provider_add_record): a grant by section whose edit_sections names the
// part, or, for notes and vaccinations, the older write scopes. It also records which business wrote the row. On a
// database without 0160 the older scopes keep their original path and nothing else can be added.

import sql from "./sql";
import { withSavepoint } from "./requestContext";
import { assertCareAccess, CareAccessError, recordCareAccess } from "./careAccess";
import { isMissingSchema } from "./recordLink";
import { cleanText } from "./cleanText";

export const isRecordId = (value) => /^[1-9]\d{0,8}$/.test(String(value ?? ""));

const DENIED = "No active care-access grant for the required scope";

// { outcome, grantId, record }, or null only when the database has no such function (before 0160).
async function askToAdd({ petId, providerId, section, data }) {
  try {
    const rows = await withSavepoint(async () => {
      return await sql`
        SELECT outcome, grant_id, record
        FROM app_provider_add_record(
          ${petId}::int, ${providerId}::int, ${section}, ${JSON.stringify(cleanFields(data))}::text::jsonb)
      `;
    });
    const row = rows?.[0];
    return { outcome: row?.outcome ?? "not_allowed", grantId: row?.grant_id, record: row?.record };
  } catch (error) {
    if (!isMissingSchema(error)) throw error;
    return null;
  }
}

const cleanFields = (data) =>
  Object.fromEntries(Object.entries(data).map(([key, value]) => [key, cleanText(value)]));

/**
 * Add one row to a pet's record for a business, recording the access.
 *
 * @param {{ petId, providerId, staffUserId: number, section: 'vet_notes'|'vaccines'|'lab_results'|'files',
 *           data: object, resource: string, olderScope?: string }} args `olderScope`: the write scope that already
 *   allowed this before sharing by section ('medical_write', 'vaccinations_write'), used on a database without 0160
 * @returns {Promise<{ record: object } | { badData: true } | { olderPath: true }>} `olderPath`: the database has no
 *   0160 and the older scope allows it, so the caller inserts as it always did
 * @throws {CareAccessError} when nothing allows it
 */
export async function addForProvider({
  petId, providerId, staffUserId, section, data, resource, olderScope = null,
}) {
  // An id written any other way ("01") never reaches either way of writing.
  if (!isRecordId(petId) || !isRecordId(providerId)) throw new CareAccessError(DENIED);
  // The database decides first; the access is recorded only for a row that was written, after the lock it takes.
  const added = await askToAdd({ petId, providerId, section, data });
  if (added) {
    if (added.outcome === "bad_data") return { badData: true };
    if (added.outcome !== "added") throw new CareAccessError(DENIED);
    await recordCareAccess(added.grantId, staffUserId, "write", resource);
    return { record: added.record };
  }
  if (!olderScope) throw new CareAccessError(DENIED);
  // Records the access itself, and throws when the scope does not allow this.
  await assertCareAccess(petId, providerId, olderScope, { staffUserId, action: "write", resource });
  return { olderPath: true };
}

/** May this business add to this part now? The pet and grant for a check made before a file is stored. */
export async function providerMayAdd({ petId, providerId, section }) {
  if (!isRecordId(petId) || !isRecordId(providerId)) return false;
  try {
    const rows = await withSavepoint(async () => {
      return await sql`
        SELECT grant_id FROM app_provider_may_add(${petId}::int, ${providerId}::int, ${section})
      `;
    });
    return rows.length > 0;
  } catch (error) {
    if (!isMissingSchema(error)) throw error;
    return false;
  }
}

/**
 * A row of the record as the owner and family read it: who added it, in the fields app versions already show. A row a
 * business added is named after the business; one added through a record link says so, in the owner's language.
 * Expects `added_by_provider_name` and `owner_locale` from the query.
 */
export function presentSharedRow({ owner_locale, record_link_id: _link, ...row }) {
  if (row.via_record_link) {
    const en = owner_locale === "en";
    let who = row.external_author_name;
    if (who === "Former member") who = en ? "Former member" : "Ex integrante";
    who = who || (en ? "Anonymous" : "Cambios de alguien externo");
    const { created_by_user_id: _author, ...rest } = row;
    return { ...rest, created_by_name: `${who} (${en ? "shared link" : "enlace compartido"})`, created_by_role: "editor" };
  }
  if (row.added_by_provider_name) {
    return { ...row, created_by_name: row.added_by_provider_name, created_by_role: "editor" };
  }
  return row;
}

/**
 * A row of the record as a business reads it: one added through a record link never carries which account the link's
 * visitor used, nor which link it was.
 */
export function forBusiness(row) {
  if (!row.via_record_link) return row;
  const { record_link_id: _link, created_by_user_id: _author, ...rest } = row;
  return rest;
}
