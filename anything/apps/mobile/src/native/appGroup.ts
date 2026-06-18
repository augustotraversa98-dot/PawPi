// ───────────────────────────────────────────────────────────────────────────
// THE SINGLE SOURCE OF TRUTH for every Apple-account-gated identifier used by
// the iOS Widget / Live Activity / Watch native targets (ticket 2.76).
//
// 🟠 WORK-AHEAD STATUS: the Apple Developer account is not ready yet, so every
// value below is a clearly-labelled PLACEHOLDER. NOTHING here is a real Apple
// identifier. When the account lands, editing these few lines is the ONLY code
// change needed to point the JS side at the real App Group — see
// docs/native-widgets.md → "FINISH WHEN THE APPLE ACCOUNT IS READY".
//
// Keep this file dependency-free and importable from anywhere (RN + tooling).
// ───────────────────────────────────────────────────────────────────────────

/**
 * The App Group container id shared between the RN app and the widget / watch
 * extensions. The RN app WRITES the snapshot JSON into this group; the widget
 * READS it. Registering this id under the team and enabling the "App Groups"
 * capability are Apple-account steps (deferred).
 *
 * TODO(Tats): replace with the REAL App Group id registered under the team,
 * e.g. "group.com.pawpi.app.shared". It must be identical here AND in
 * targets/widget/expo-target.config.js (entitlements) — flip both together.
 */
export const APP_GROUP_ID = "group.PLACEHOLDER.pawpi"; // TODO(Tats): real App Group ID

/**
 * True once the real App Group id has been pasted in above. The widget bridge
 * uses this to no-op cleanly (instead of attempting a native write that would
 * fail) for as long as the placeholder is in place. Flipping APP_GROUP_ID to a
 * non-placeholder value automatically arms the bridge — no other edit needed.
 */
export const isAppGroupConfigured = (): boolean =>
  !APP_GROUP_ID.includes("PLACEHOLDER");

/**
 * The key the snapshot JSON is stored under inside the shared container
 * (shared UserDefaults / a shared file). The Swift widget reads the SAME key.
 * Safe to keep stable across releases.
 */
export const WIDGET_SNAPSHOT_KEY = "pawpi.widget.snapshot.v1";

/**
 * The WidgetKit "kind" string — must match the kind declared by the SwiftUI
 * widget in targets/widget. Used when asking WidgetCenter to reload timelines.
 */
export const WIDGET_KIND = "PawPiTodayWidget";

/**
 * The custom URL scheme the widget deep-links into (e.g. pawpi://widget/today).
 * Declared in app.json ("scheme") and parsed by resolveWidgetRoute().
 */
export const APP_URL_SCHEME = "pawpi";
