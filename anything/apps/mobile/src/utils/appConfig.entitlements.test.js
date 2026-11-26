// The emergency finder push asks iOS for "time-sensitive" delivery; without this entitlement in the native build
// iOS silently delivers it as a normal notification. Critical alerts need Apple's special approval and are not used.
const { expo } = require("../../app.json");

test("the app asks for time-sensitive notifications, and not for critical alerts", () => {
  expect(expo.ios.entitlements["com.apple.developer.usernotifications.time-sensitive"]).toBe(true);
  expect(expo.ios.entitlements["com.apple.developer.usernotifications.critical-alerts"]).toBeUndefined();
});
