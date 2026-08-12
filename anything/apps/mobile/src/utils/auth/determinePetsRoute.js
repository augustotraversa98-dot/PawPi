/**
 * Pure decision for the EntryPoint gate, given the outcome of `GET /api/pets`
 * (and, secondarily, `GET /api/providers` — the businesses the account is active
 * staff of).
 *
 * The gate must distinguish the failure-vs-success outcomes that were previously
 * collapsed into "no pets → onboarding":
 *
 *   - auth invalid (401/403) → clear the stored session and go to login.
 *     Never onboarding: an expired token can't save an onboarding write either,
 *     which is how users got trapped.
 *   - network error / timeout / non-auth failure (5xx, unparseable body) →
 *     do NOT route to onboarding (a transient blip must not create a duplicate
 *     pet). Surface a retry state instead.
 *   - 200 OK → route on the data.
 *
 * ROLE-AWARE ENTRY (business mode): an account that is active staff of ≥1
 * provider is a BUSINESS account, not a pet owner. Such an account must NEVER be
 * pushed into "let's meet your dog" pet onboarding:
 *   - has pets → home (the pet app; a both-owner-AND-staff account keeps the pet
 *     app and reaches Business home from the More menu).
 *   - no pets but IS staff → Business home.
 *   - no pets and NOT staff → the normal pet onboarding.
 * The providers signal is best-effort: it only matters on the empty-pets branch,
 * and it degrades to "not a business" ([] / undefined) so a failed/absent
 * providers read never blocks the pet flow.
 *
 * Kept pure (no React, no side effects) so the routing logic is unit-testable
 * without the RN runtime. The caller performs the side effects (setAuth(null),
 * navigation, AsyncStorage).
 *
 * @param {object} outcome
 * @param {boolean} [outcome.networkError] - fetch threw (timeout / no network).
 * @param {number}  [outcome.status]       - HTTP status when a response arrived.
 * @param {boolean} [outcome.ok]           - response.ok.
 * @param {Array}   [outcome.pets]         - parsed pets array on a 200 response.
 * @param {Array}   [outcome.providers]    - providers the account is active staff
 *                                            of (best-effort; [] when none/unknown).
 * @returns {{ action: 'login' | 'home' | 'business' | 'onboarding' | 'error',
 *             destination?: string, clearSession?: boolean }}
 */
export function determinePetsRoute({
  networkError,
  status,
  ok,
  pets,
  providers,
} = {}) {
  if (networkError) {
    return { action: 'error' };
  }

  if (status === 401 || status === 403) {
    return { action: 'login', destination: '/welcome', clearSession: true };
  }

  if (!ok) {
    return { action: 'error' };
  }

  if (pets && pets.length > 0) {
    return { action: 'home', destination: '/(tabs)' };
  }

  // No pets. A business account (active staff of ≥1 provider) goes to Business
  // home instead of pet onboarding.
  if (Array.isArray(providers) && providers.length > 0) {
    return { action: 'business', destination: '/business' };
  }

  return { action: 'onboarding', destination: '/onboarding-photo' };
}

export default determinePetsRoute;
