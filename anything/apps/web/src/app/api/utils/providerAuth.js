// providerAuth — the reusable provider-authorization chokepoint.
// Every provider-scoped route authorizes through requireProviderRole; 4b
// (locations/services) and 4c (staff) reuse it (docs/provider-design.md §4).
//
// Authorization is by provider_staff MEMBERSHIP, NEVER by user_profiles.role
// (that column is the consumer role like 'pet_owner' and must not gate provider
// actions — docs/provider-design.md §1). A caller is authorized for a provider
// only if a provider_staff row exists for (provider_id, user_profile_id) with
// status='active' and a role in the allowed set.
//
// Style-matches careAccess.js: a 403-shaped error class, a single tagged-template
// query that lets Postgres do the filtering (a removed/invited membership or a
// disallowed role simply returns no row → denied), and the row returned on success.
//
// DB is porsager's tagged-template `sql` (see ./sql + SCHEMA_NOTES "neon→porsager"
// gotcha): every query is a tagged template; params bind via `${}`.

import sql from './sql';

// Every provider_staff role — pass as allowedRoles for read paths where any
// active staff member (owner/admin/staff/vet) may view the provider.
export const ALL_PROVIDER_ROLES = ['owner', 'admin', 'staff', 'vet'];

// The allowed capability set (ticket 2.1) — the services a provider can offer. This
// is the app-side mirror of the DB CHECK on provider_capabilities.capability; both are
// kept in sync (the DB enforces it for hand-applied SQL, the route returns a clean 400
// on a bad value instead of a 500). From 2.1 on, EVERY service module gates on a
// CAPABILITY, never on providers.provider_type (which is now display-only).
export const ALLOWED_CAPABILITIES = [
  'vet',
  'groomer',
  'walker',
  'daycare',
  'sitter',
  'trainer',
  'shop',
  'adoption',
  'transport',
  'pharmacy',
  'telehealth',
  'insurance',
];

/**
 * 403-shaped error consistent with route error handling: carries a `.status` of
 * 403 and a human message. A calling route converts it, e.g.
 *   catch (e) { return Response.json({ error: e.message }, { status: e.status ?? 500 }); }
 */
export class ProviderAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProviderAuthError';
    this.status = 403;
  }
}

/**
 * Assert that a user is authorized to act on a provider, by active staff
 * membership in one of the allowed roles. Returns the membership row.
 *
 * @param {number} providerId
 * @param {number} userProfileId         user_profiles.id of the acting user
 * @param {string[]} [allowedRoles]      roles permitted (default owner|admin)
 * @returns {Promise<object>} the active provider_staff membership row
 * @throws {ProviderAuthError} 403 when there is no active membership in an
 *                             allowed role (covers no membership, removed/invited
 *                             status, and disallowed role identically)
 */
export async function requireProviderRole(
  providerId,
  userProfileId,
  allowedRoles = ['owner', 'admin']
) {
  // Postgres does the filtering: status must be 'active' AND the role must be in
  // the allowed set, both scoped to this provider + this user. Any failure mode
  // (no row, removed/invited, wrong role, wrong provider) returns no row.
  const membership = await sql`
    SELECT *
    FROM provider_staff
    WHERE provider_id = ${providerId}
      AND user_profile_id = ${userProfileId}
      AND status = 'active'
      AND role = ANY (${allowedRoles})
    LIMIT 1
  `;
  if (!membership || membership.length === 0) {
    throw new ProviderAuthError('Not authorized for this provider');
  }
  return membership[0];
}

/**
 * Assert that a provider HOLDS a given capability (ticket 2.1). The module-gating
 * chokepoint for every later service route: e.g. the grooming routes call
 * requireProviderCapability(providerId, 'groomer') so they 403 if the provider lacks
 * that capability. Uses the provider_has_capability(provider_id, capability) DB helper
 * (a single EXISTS), so it stays correct under provider_capabilities RLS.
 *
 * Capability ≠ data access — this only gates whether a service MODULE is unlocked for a
 * provider; consent (assertCareAccess / care_access_grants) and the owner/medical RLS
 * still gate pet data independently.
 *
 * @param {number} providerId
 * @param {string} capability   one of ALLOWED_CAPABILITIES
 * @throws {ProviderAuthError} 403 when the provider does not hold the capability
 */
export async function requireProviderCapability(providerId, capability) {
  const rows = await sql`
    SELECT provider_has_capability(${providerId}, ${capability}) AS has
  `;
  if (!rows?.[0]?.has) {
    throw new ProviderAuthError(
      `Provider does not have the '${capability}' capability`,
    );
  }
}
