// "This navigation is expected" bookkeeping for nav_unexpected_redirect. PURE (clock injected).
//
//   markExpectedNavigation()      -> the NEXT landing on onboarding*/welcome within `windowMs` is a user action
//                                    (sign-out, delete account...): do not report it.
//   markNavigationReason(reason)  -> the next such landing IS reported, with this registry reason
//                                    (e.g. "session_expired", "deeplink").
//
// Neither changes any navigation: they only annotate what the observer sees.

import { NAV_REDIRECT_REASONS } from './registry';

export const EXPECT_WINDOW_MS = 5000;

export function createNavExpectation({ now = () => Date.now(), windowMs = EXPECT_WINDOW_MS } = {}) {
  let expectedUntil = 0;
  let reason = null;
  let reasonUntil = 0;
  return {
    markExpected() {
      expectedUntil = now() + windowMs;
    },
    markReason(r) {
      if (!NAV_REDIRECT_REASONS.includes(r)) return;
      reason = r;
      reasonUntil = now() + windowMs;
    },
    /** Read-and-clear. */
    take() {
      const t = now();
      const out = {
        expected: t <= expectedUntil,
        reason: reason !== null && t <= reasonUntil ? reason : null,
      };
      expectedUntil = 0;
      reason = null;
      reasonUntil = 0;
      return out;
    },
  };
}

// Process-wide instance used by the app code.
const shared = createNavExpectation();

export function markExpectedNavigation() {
  try {
    shared.markExpected();
  } catch {
    // never throws
  }
}

export function markNavigationReason(reason) {
  try {
    shared.markReason(reason);
  } catch {
    // never throws
  }
}

export const takeNavigationExpectation = () => shared.take();
