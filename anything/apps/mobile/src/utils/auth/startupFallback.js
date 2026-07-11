import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from './store';
import { markBootStep } from '../../../__create/boot-trace';

// Hard startup deadline (the un-brick guarantee).
//
// The ONLY thing that ever removes the native splash screen is the
// SplashScreen.hideAsync() call gated behind a long async chain:
// bundle eval → router mounts RootLayout → initiate() races SecureStore →
// isReady flips → re-render → hide effect. If ANY link stalls, the app sits
// on the splash forever with no crash and no logs (TestFlight Build 6).
//
// This deadline is scheduled from the entrypoint module itself — outside
// React — so it fires even if the React tree never mounts. When it fires it
// unconditionally hides the splash and, if the auth store never became ready,
// forces it ready with no session: the normal EntryPoint logic then falls
// through to the Welcome/login screen. A stalled startup now degrades to a
// usable screen instead of a frozen logo.
//
// 4000ms: comfortably after initiate()'s own 3s SecureStore race, so the
// fallback only ever acts when the normal path is already wedged.
export const STARTUP_FALLBACK_DELAY_MS = 4000;

export function scheduleStartupFallback(delayMs = STARTUP_FALLBACK_DELAY_MS) {
  try {
    setTimeout(() => {
      try {
        SplashScreen.hideAsync().catch(() => {});
        if (!useAuthStore.getState().isReady) {
          markBootStep('fallback:forced-ready');
          useAuthStore.setState({ auth: null, isReady: true });
        }
      } catch (_err) {
        // The fallback must never throw — it is the last line of defense.
      }
    }, delayMs);
  } catch (_err) {
    // Silent
  }
}
