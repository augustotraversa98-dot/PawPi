/**
 * Pure decision for the EntryPoint gate, given the outcome of `GET /api/pets`.
 *
 * The gate must distinguish three failure-vs-success outcomes that were
 * previously collapsed into "no pets → onboarding":
 *
 *   - auth invalid (401/403) → clear the stored session and go to login.
 *     Never onboarding: an expired token can't save an onboarding write either,
 *     which is how users got trapped.
 *   - network error / timeout / non-auth failure (5xx, unparseable body) →
 *     do NOT route to onboarding (a transient blip must not create a duplicate
 *     pet). Surface a retry state instead.
 *   - 200 OK → route on the data: has pets → home, empty → onboarding.
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
 * @returns {{ action: 'login' | 'home' | 'onboarding' | 'error',
 *             destination?: string, clearSession?: boolean }}
 */
export function determinePetsRoute({ networkError, status, ok, pets } = {}) {
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

  return { action: 'onboarding', destination: '/onboarding-photo' };
}

export default determinePetsRoute;
