// Widget deep links (ticket 2.76, Phase 1) — when the user taps the iOS widget,
// iOS opens the app with a `pawpi://widget/...` URL. expo-router can't map those
// directly (they're an indirection, not a route path), so we translate them with
// the pure resolveWidgetRoute() and push the matching screen. Handles both the
// cold-start URL (app launched by the tap) and warm URLs (app already running).
//
// Safe before the widget exists: with no widget installed no such URL ever
// arrives, so this is dormant until Phase 1 ships on-device.

import { useEffect } from "react";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";

import { resolveWidgetRoute, WIDGET_TARGETS } from "@/utils/widgetSnapshot";
import { APP_URL_SCHEME } from "./appGroup";

const WIDGET_PREFIX = `${APP_URL_SCHEME}://widget/`;

export function useWidgetDeepLinks() {
  const router = useRouter();

  useEffect(() => {
    const handle = (url) => {
      if (typeof url !== "string" || !url.startsWith(WIDGET_PREFIX)) return;
      const { pathname, params } = resolveWidgetRoute(url);
      try {
        router.push({ pathname, params });
      } catch {
        // Never let a malformed deep link crash navigation — land on the feed.
        router.push({ pathname: "/(tabs)", params: {} });
      }
    };

    // Cold start: the URL that launched the app (if any).
    Linking.getInitialURL()
      .then(handle)
      .catch(() => {});

    // Warm: subsequent taps while the app is already open.
    const sub = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => sub.remove();
  }, [router]);
}

// Re-exported for callers that want the canonical target list.
export { WIDGET_TARGETS };
