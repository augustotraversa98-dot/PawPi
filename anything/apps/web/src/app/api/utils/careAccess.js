// careAccess — the ONLY sanctioned path for provider→pet-data.
// Cornerstone of docs/provider-design.md §3 ("assertCareAccess is the only path").
//
// Every provider-side route that reads or writes a pet's data MUST call
// assertCareAccess first. Owner-context routes keep their existing
// `WHERE owner_user_id = me` pattern and do NOT use this.
//
// Enforcement contract, in order:
//   1. the caller is active staff of providerId   (provider_staff.status = 'active')
//   2. an active, unexpired care_access_grants row exists for (petId, providerId)
//      whose scopes include requiredScope
//   3. an append-only care_access_audit row is written
//   4. the grant row is returned
// Any failure throws a CareAccessError (status 403) — never returns silently.
//
// DB is porsager's tagged-template `sql` (see ./sql + SCHEMA_NOTES "neon→porsager"
// gotcha): every query is a tagged template; params bind via `${}`. The grant
// query lets Postgres do the filtering (status / expiry / scope / provider), so a
// revoked, expired, scope-missing, or cross-provider grant simply returns no row —
// the helper treats "no row" as denied regardless of the reason.

import sql from './sql';

// The enumerated care_access scope vocabulary (docs/provider-design.md §2). This is the SINGLE
// source of truth honored by assertCareAccess (`requiredScope = ANY (scopes)`): every route that
// creates a grant — provider-requested (providers/[id]/access-requests) or owner-initiated
// (care-access/grants POST) — validates its scopes against THIS list, so a grant can never store
// a scope the enforcement layer won't match (the class of bug that made owner sharing a no-op).
export const VALID_CARE_SCOPES = [
  'medical_read',
  'medical_write',
  'vaccinations_write',
  'appointments',
  'health_logs_read',
  'health_logs_write',
  'messaging',
];

/**
 * 403-shaped error consistent with route error handling: carries a `.status` of
 * 403 and a human message. A calling route converts it, e.g.
 *   catch (e) { return Response.json({ error: e.message }, { status: e.status ?? 500 }); }
 */
export class CareAccessError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CareAccessError';
    this.status = 403;
  }
}

/**
 * Assert that the calling staff member may access a pet's data through a provider,
 * writing an audit row on success.
 *
 * @param {number} petId
 * @param {number} providerId
 * @param {string} requiredScope        one of the enumerated care_access scopes
 * @param {object} ctx
 * @param {number} ctx.staffUserId      user_profiles.id of the acting staff member
 * @param {'read'|'write'} ctx.action   audit action
 * @param {string} ctx.resource         audited resource, e.g. 'vet_notes:123'
 * @returns {Promise<object>} the active grant row
 * @throws {CareAccessError} 403 on missing membership, grant, or scope
 */
export async function assertCareAccess(
  petId,
  providerId,
  requiredScope,
  { staffUserId, action, resource }
) {
  // 1. caller must be active staff of this provider.
  const staff = await sql`
    SELECT id
    FROM provider_staff
    WHERE provider_id = ${providerId}
      AND user_profile_id = ${staffUserId}
      AND status = 'active'
    LIMIT 1
  `;
  if (!staff || staff.length === 0) {
    throw new CareAccessError('Not active staff of this provider');
  }

  // 2. an active, unexpired grant for (pet, provider) covering the scope.
  const grants = await sql`
    SELECT *
    FROM care_access_grants
    WHERE pet_id = ${petId}
      AND provider_id = ${providerId}
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
      AND ${requiredScope} = ANY (scopes)
    LIMIT 1
  `;
  if (!grants || grants.length === 0) {
    throw new CareAccessError('No active care-access grant for the required scope');
  }
  const grant = grants[0];

  // 3. append-only audit row — provider→pet-data access is always logged.
  await recordCareAccess(grant.id, staffUserId, action, resource);

  // 4. hand the caller the grant it just earned.
  return grant;
}

/** One append-only care_access_audit row. */
export async function recordCareAccess(grantId, staffUserId, action, resource) {
  await sql`
    INSERT INTO care_access_audit (grant_id, staff_user_id, action, resource)
    VALUES (${grantId}, ${staffUserId}, ${action}, ${resource})
  `;
}

// ── Sharing the vet record by section (migration 0147, docs/vet-sharing-design.md) ──
// A grant by section carries exactly the scope below and a list of sections. The scope is deliberately NOT part of
// VALID_CARE_SCOPES: no route accepts it as a requested scope and assertCareAccess is never asked for it, so a check
// that does not know about sections denies such a grant. Only the provider record route and the private media route
// read sections, through the two functions below. Grants by section are read only.

export const RECORD_SECTIONS_SCOPE = 'record_sections';

export const RECORD_SECTIONS = [
  'profile',
  'emergency_contact',
  'insurance',
  'vet_notes',
  'vaccines',
  'files',
  'photos',
  'lab_results',
];

// How long the owner shares for: expiry key → Postgres interval. null = until the owner revokes.
export const SHARE_EXPIRY_INTERVALS = {
  '7d': '7 days',
  '30d': '30 days',
  '1y': '1 year',
  until_revoked: null,
};

/**
 * The active, unexpired grant by section that THIS provider holds on the pet, given by the pet's current owner, when the
 * caller is active staff of that provider. Returns null otherwise. Writes nothing: the caller records the access once it
 * knows what is being read. Read only the sections listed on the returned grant.
 */
export async function findSectionGrant(petId, providerId, staffUserId) {
  const grants = await sql`
    SELECT g.*
    FROM care_access_grants g
    JOIN provider_staff ps
      ON ps.provider_id = g.provider_id
     AND ps.user_profile_id = ${staffUserId}
     AND ps.status = 'active'
    JOIN pets p
      ON p.id = g.pet_id AND p.owner_user_id = g.owner_user_id
    WHERE g.pet_id = ${petId}
      AND g.provider_id = ${providerId}
      AND g.status = 'active'
      AND (g.expires_at IS NULL OR g.expires_at > now())
      AND g.sections IS NOT NULL
    ORDER BY g.id DESC
    LIMIT 1
  `;
  return grants?.[0] ?? null;
}

/**
 * Assert that a private file of the pet belongs to a row of a section this provider was given: a document ('files') or a
 * photo check ('photos') of the same pet that points at exactly this key. Records the read on success.
 *
 * @returns {Promise<object>} the grant row
 * @throws {CareAccessError} 403 when there is no such grant, or the file is outside what it shares
 */
export async function assertSharedFileAccess(petId, providerId, key, { staffUserId }) {
  const grant = await findSectionGrant(petId, providerId, staffUserId);
  if (!grant) {
    throw new CareAccessError('No active care-access grant for this file');
  }
  const files = grant.sections.includes('files');
  const photos = grant.sections.includes('photos');
  const rows = await sql`
    SELECT 1 AS found
    WHERE (${files}::boolean AND EXISTS (
            SELECT 1 FROM vet_documents WHERE pet_id = ${petId} AND file_url = ${key}))
       OR (${photos}::boolean AND EXISTS (
            SELECT 1 FROM health_photo_checks WHERE pet_id = ${petId} AND image_url = ${key}))
  `;
  if (rows.length === 0) {
    throw new CareAccessError('This file is not part of what was shared');
  }
  await recordCareAccess(grant.id, staffUserId, 'read', `media:${key}`);
  return grant;
}
