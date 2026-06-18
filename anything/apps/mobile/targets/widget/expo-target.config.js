/**
 * PawPi Home/Lock-screen Widget target (ticket 2.76, Phase 1).
 *
 * Read by `@bacons/apple-targets` during `expo prebuild` to generate a WidgetKit
 * extension inside the iOS project. The SwiftUI source lives next to this file
 * (widget.swift) and renders against a hardcoded sample in Xcode previews.
 *
 * 🟠 ACCOUNT-GATED VALUE: the App Group below is a PLACEHOLDER. It MUST match
 * APP_GROUP_ID in src/native/appGroup.ts — flip BOTH to the real id together
 * when the Apple Developer account is ready (see docs/native-widgets.md).
 *
 * @type {import('@bacons/apple-targets/app.config').Config}
 */
module.exports = {
  type: "widget",
  icon: "../../assets/images/icon.png",
  // Warm PawPi palette exposed to SwiftUI as $accent / $widgetBackground.
  colors: {
    $accent: "#FF6F61", // coral
    $widgetBackground: "#FFF7EF", // cream
  },
  deploymentTarget: "16.0", // accessory (Lock-screen) families need iOS 16+
  entitlements: {
    // TODO(Tats): real App Group ID — keep identical to src/native/appGroup.ts.
    "com.apple.security.application-groups": ["group.PLACEHOLDER.pawpi"],
  },
};
