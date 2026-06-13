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
  await sql`
    INSERT INTO care_access_audit (grant_id, staff_user_id, action, resource)
    VALUES (${grant.id}, ${staffUserId}, ${action}, ${resource})
  `;

  // 4. hand the caller the grant it just earned.
  return grant;
}
