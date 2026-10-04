// TelemetryProvider: the ONE place telemetry is started (mounted once, at the root layout via
// useTelemetryLifecycle()). It
//   - loads the user's preference, starts timed flushing and fetches GET /api/telemetry/config (kill switch /
//     sampleRate; fail closed until it answers),
//   - turns AppState changes into session end / start (30 min of background = a new session) and flushes when the
//     app goes to background,
//   - feeds every pathname change to the navigation observer (screen_view, perf_screen_ready,
//     nav_unexpected_redirect),
//   - chains observation-only global error handlers (js / promise).
// Everything is guarded: this can never break rendering or navigation. Pure logic lives in client.js,
// navObserver.js and errorHooks.js (unit tested without react-native).

import { useEffect, useRef } from 'react';
import { AppState, InteractionManager } from 'react-native';
import { usePathname } from 'expo-router';
import { getTelemetry } from './runtime';
import { track, trackError } from './track';
import { createNavObserver } from './navObserver';
import { takeNavigationExpectation } from './navExpect';
import { setCurrentScreen } from './screenState';
import { installGlobalErrorHandlers } from './errorHooks';

export function useTelemetryLifecycle() {
  const pathname = usePathname();

  useEffect(() => {
    let subscription = null;
    let uninstall = null;
    try {
      const telemetry = getTelemetry();
      void telemetry.start();
      subscription = AppState.addEventListener('change', (next) => {
        if (next === 'background') telemetry.onBackground();
        else if (next === 'active') telemetry.onForeground();
      });
      uninstall = installGlobalErrorHandlers({
        report: (kind, err) => trackError(kind, err, kind === 'js' ? 'JsError' : 'PromiseRejection'),
      });
    } catch {
      // telemetry must never break the app
    }
    return () => {
      try {
        subscription?.remove?.();
        uninstall?.();
      } catch {
        // ignore
      }
    };
  }, []);

  const observer = useRef(null);
  if (!observer.current) {
    observer.current = createNavObserver({
      emit: track,
      takeExpectation: takeNavigationExpectation,
      onScreen: setCurrentScreen,
    });
  }

  useEffect(() => {
    let handle = null;
    try {
      if (typeof pathname !== 'string') return undefined; // navigation not ready: nothing to observe yet
      observer.current.onPathname(pathname);
      handle = InteractionManager.runAfterInteractions(() => observer.current.ready());
    } catch {
      // ignore
    }
    return () => {
      try {
        handle?.cancel?.();
      } catch {
        // ignore
      }
    };
  }, [pathname]);
}

export default function TelemetryProvider() {
  useTelemetryLifecycle();
  return null;
}
