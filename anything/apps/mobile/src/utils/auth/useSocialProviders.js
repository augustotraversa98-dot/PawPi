import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { decideSocialButtons } from "./socialAuthShared";

// Probes the backend for which social providers are actually configured (GET
// /api/auth/social-enabled → { google, apple }) and combines that with native-device support to
// decide which buttons to render. If the probe fails, or a provider isn't configured, that
// button is simply not shown — there is no "coming soon". Requires no session (called from the
// signed-out Welcome screen); the wrapped global fetch adds the base URL + platform headers.
export function useSocialProviders() {
  const [state, setState] = useState({ showGoogle: false, showApple: false, loaded: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let enabled = {};
      let appleNativeAvailable = false;
      try {
        const res = await fetch("/api/auth/social-enabled");
        if (res.ok) enabled = await res.json();
      } catch {
        // network / offline — leave everything off.
      }
      try {
        // Lazy-require so the native module (expo-apple-authentication) stays out of the static
        // import graph — keeps the signed-out screen light and unit tests free of native mocks.
        const { isAppleAuthAvailable } = require("./socialAuth");
        appleNativeAvailable = await isAppleAuthAvailable();
      } catch {
        appleNativeAvailable = false;
      }
      if (cancelled) return;
      const { showGoogle, showApple } = decideSocialButtons({
        enabled,
        appleNativeAvailable,
        platform: Platform.OS,
      });
      setState({ showGoogle, showApple, loaded: true });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export default useSocialProviders;
