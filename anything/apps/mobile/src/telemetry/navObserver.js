// Navigation observer: turns pathname changes into screen_view / perf_screen_ready / nav_unexpected_redirect.
// PURE (emit, clock and expectation source are injected; no react-native / expo-router import).
//
// nav_unexpected_redirect fires when the app LANDS on onboarding* or welcome* coming from a screen that is not
// part of the pre-auth flow, unless the navigation was marked expected (sign-out, delete account) -- i.e. the
// "Services -> onboarding" class of bug. The very first screen of a launch and the EntryPoint ("/") decision are
// never reported. Reasons are registry NAV_REDIRECT_REASONS.

import { routeTemplate } from './routeTemplate';
import { msBucket } from './bucket';

export const GUARD_TARGETS = ['/onboarding', '/onboarding-photo', '/onboarding-photo-preview', '/welcome', '/welcome-back'];
// Screens from which landing on onboarding/welcome is the normal flow (never reported).
export const EXPECTED_FROM = [
  '/',
  '/auth/expo-web-success',
  '/vet-business-access',
  ...GUARD_TARGETS,
];

export function createNavObserver({ emit, now = () => Date.now(), takeExpectation = () => ({ expected: false, reason: null }), onScreen = () => {} }) {
  let current = null;
  let pendingReady = null; // { screen, startedAt }

  return {
    /** Call with every pathname change (and once with the initial pathname). Never throws. */
    onPathname(pathname) {
      try {
        const to = routeTemplate(pathname);
        if (to === current) return;
        const from = current;
        current = to;
        onScreen(to);
        emit('screen_view', { screen: to });
        pendingReady = { screen: to, startedAt: now() };

        if (from !== null && GUARD_TARGETS.includes(to) && !EXPECTED_FROM.includes(from)) {
          const { expected, reason } = takeExpectation();
          if (reason) {
            emit('nav_unexpected_redirect', { from, to, reason });
          } else if (!expected) {
            const auto = to.startsWith('/welcome') ? 'welcome_guard' : 'onboarding_guard';
            emit('nav_unexpected_redirect', { from, to, reason: auto });
          }
        }
      } catch {
        // telemetry must never throw
      }
    },

    /** Call once the screen settled (after interactions). Emits perf_screen_ready for the latest screen. */
    ready() {
      try {
        if (!pendingReady) return;
        const { screen, startedAt } = pendingReady;
        pendingReady = null;
        const bucket = msBucket(now() - startedAt);
        if (bucket) emit('perf_screen_ready', { screen, ms_bucket: bucket });
      } catch {
        // ignore
      }
    },

    currentScreen: () => current,
  };
}
