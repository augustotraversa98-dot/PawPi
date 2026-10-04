// Global JS error / unhandled-promise hooks. No react-native import: the global object is injected.
//
// installGlobalErrorHandlers({ report })  report(kind, err) with kind "js" | "promise".
//   - ErrorUtils.setGlobalHandler (React Native): CHAINS to the previous handler, which always still runs, so the
//     red-box / crash / testflight-logger behaviour is unchanged. Telemetry only observes.
//   - "unhandledrejection" (web / runtimes that dispatch it): observed, not prevented.
// Only the error CLASS NAME ever leaves the device (see apiCall.errorCodeOf), never the message or stack.

export function installGlobalErrorHandlers({ report, globalObj = globalThis }) {
  const cleanups = [];
  try {
    const EU = globalObj.ErrorUtils;
    if (EU && typeof EU.getGlobalHandler === 'function' && typeof EU.setGlobalHandler === 'function') {
      const previous = EU.getGlobalHandler();
      EU.setGlobalHandler((error, isFatal) => {
        try {
          report('js', error);
        } catch {
          // never throws
        }
        if (typeof previous === 'function') previous(error, isFatal);
      });
      cleanups.push(() => {
        try {
          EU.setGlobalHandler(previous);
        } catch {
          // ignore
        }
      });
    }
  } catch {
    // ignore
  }
  try {
    if (typeof globalObj.addEventListener === 'function') {
      const onRejection = (event) => {
        try {
          report('promise', event?.reason);
        } catch {
          // never throws
        }
      };
      globalObj.addEventListener('unhandledrejection', onRejection);
      cleanups.push(() => {
        try {
          globalObj.removeEventListener?.('unhandledrejection', onRejection);
        } catch {
          // ignore
        }
      });
    }
  } catch {
    // ignore
  }
  return () => cleanups.forEach((fn) => fn());
}
