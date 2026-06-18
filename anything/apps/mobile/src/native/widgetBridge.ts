// ───────────────────────────────────────────────────────────────────────────
// Widget bridge (ticket 2.76, Phase 1) — the ONLY place that talks to the
// native side. It writes the snapshot JSON into the shared App Group container
// and asks WidgetKit to reload the widget's timelines.
//
// The native plumbing comes from `@bacons/apple-targets`'s ExtensionStorage
// module (App Group shared UserDefaults write + WidgetCenter.reloadTimelines) —
// so there is NO custom native module to maintain. The Swift widget reads the
// SAME App Group + key (see targets/widget/widget.swift).
//
// 🟠 GUARDED / STAGED: until the Apple Developer account lands there is no real
// App Group and the native module isn't compiled in (managed app / Expo Go /
// jest), so EVERY path here no-ops cleanly (logging once in dev). Flipping
// APP_GROUP_ID in appGroup.ts to the real id + running an EAS dev build is all
// it takes to arm it — no other JS change. See docs/native-widgets.md.
// ───────────────────────────────────────────────────────────────────────────

import { Platform } from "react-native";

import { APP_GROUP_ID, WIDGET_KIND, WIDGET_SNAPSHOT_KEY, isAppGroupConfigured } from "./appGroup";

// True only inside a real native build where @bacons/apple-targets' native
// ExtensionStorage module is registered (globalThis.expo.modules). In managed /
// Expo Go / jest it's absent, so we stay a no-op. globalThis access is safe even
// when `expo` is undefined.
function hasNativeStorage(): boolean {
  const expoGlobal = (globalThis as { expo?: { modules?: Record<string, unknown> } }).expo;
  return !!expoGlobal?.modules?.ExtensionStorage;
}

let warnedOnce = false;
function noopReason(reason: string): void {
  if (!warnedOnce && __DEV__) {
    warnedOnce = true;
    console.log(`[widgetBridge] skipping native sync — ${reason} (staged, ticket 2.76)`);
  }
}

/**
 * True when a real App Group is configured AND the native storage module is
 * present. Callers (WidgetSync) use this to avoid mounting the data hooks at all
 * while the bridge is still staged.
 */
export function isWidgetBridgeAvailable(): boolean {
  return Platform.OS === "ios" && isAppGroupConfigured() && hasNativeStorage();
}

/**
 * Write the snapshot to the shared container and reload the widget. Safe to call
 * anytime, on any platform: returns `false` (a clean no-op) whenever the bridge
 * isn't available yet, and never throws.
 *
 * @returns true if the snapshot was actually handed to the native side.
 */
export function syncWidgetSnapshot(snapshot: unknown): boolean {
  if (Platform.OS !== "ios") {
    noopReason("not iOS");
    return false;
  }
  if (!isAppGroupConfigured()) {
    noopReason(`App Group still placeholder (${APP_GROUP_ID})`);
    return false;
  }
  if (!hasNativeStorage()) {
    noopReason("native ExtensionStorage not installed (needs a dev/EAS build)");
    return false;
  }
  try {
    // Lazy require so the native module is never evaluated under jest / managed.
    const { ExtensionStorage } = require("@bacons/apple-targets");
    const storage = new ExtensionStorage(APP_GROUP_ID);
    storage.set(WIDGET_SNAPSHOT_KEY, JSON.stringify(snapshot));
    ExtensionStorage.reloadWidget(WIDGET_KIND);
    return true;
  } catch (err) {
    // Never let a widget write break the app.
    if (__DEV__) console.warn("[widgetBridge] native sync failed", err);
    return false;
  }
}
