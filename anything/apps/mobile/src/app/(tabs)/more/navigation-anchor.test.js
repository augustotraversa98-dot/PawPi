// Profile-tab nav-loop regression guard.
//
// The "Profile" tab IS the More tab; its `index` route is the real profile root.
// A deep push into the tab (the Feed "Getting started" card jumping straight to
// `profile-edit`) must keep `index` at the BASE of the More stack — otherwise back
// leaves the tab and the 2.19 `popToTopOnBlur` net pops to the wrong base, trapping
// the tab on a sub-screen. expo-router 6 anchors a stack via
// `export const unstable_settings = { initialRouteName: "index" }` (a.k.a. `anchor`)
// — NOT the react-navigation `initialRouteName` prop, which does not survive a deep
// link. We read the layout SOURCE (declarative config, same style as
// navigation-layers.test.js) rather than rendering the whole router tree.

const fs = require("fs");
const path = require("path");

const layoutSrc = fs.readFileSync(
  path.join(__dirname, "_layout.jsx"),
  "utf8",
);

test("the More stack anchors `index` via unstable_settings", () => {
  // Must export unstable_settings anchoring index (accept the `anchor` alias too).
  expect(layoutSrc).toMatch(
    /export\s+const\s+unstable_settings\s*=\s*\{[\s\S]*?(?:initialRouteName|anchor)\s*:\s*"index"[\s\S]*?\}/,
  );
});

test("every More sub-screen is declared in the stack", () => {
  // A pushed screen missing from the Stack still renders, but declaring them all
  // keeps the intended order/anchor explicit and documented.
  for (const name of [
    "index",
    "hub",
    "community",
    "data-access",
    "profile",
    "profile-edit",
    "reminders",
    "settings",
  ]) {
    expect(layoutSrc).toMatch(
      new RegExp(`<Stack\\.Screen\\s+name="${name}"`),
    );
  }
});
