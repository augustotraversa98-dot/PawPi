// PP1 — the "layers on layers" regression guard.
//
// Search & Discover used to be declared `presentation: "modal"` on the root
// Stack. Everything it opens is a normal push (a pet profile, and from there a
// full-screen photo viewer), so those cards stacked ON TOP of a modal — three
// layers deep with no back button, dismissable only by swipe. Making `search` a
// card put the whole chain on one back stack.
//
// This reads the layout SOURCE rather than rendering it: the screen list is
// declarative config, and the thing worth pinning is exactly that config. A
// rendered test would need the whole expo-router/react-navigation tree mocked
// and would still not assert the presentation option.

const fs = require("fs");
const path = require("path");

const layoutSrc = fs.readFileSync(
  path.join(__dirname, "_layout.jsx"),
  "utf8",
);

/**
 * The `options={{ ... }}` blob declared for a given root <Stack.Screen>, or ""
 * when the screen is declared with no options at all.
 */
function optionsFor(screenName) {
  const decl = new RegExp(
    `<Stack\\.Screen\\s+name=(?:"|\\{")${screenName}(?:"|"\\})([\\s\\S]*?)/>`,
  ).exec(layoutSrc);
  if (!decl) throw new Error(`No root <Stack.Screen name="${screenName}"> found`);
  return decl[1];
}

test('search is a CARD push — never presentation:"modal"', () => {
  expect(optionsFor("search")).not.toMatch(/presentation:\s*"modal"/);
});

test("the screens search pushes into are cards too (one back stack)", () => {
  // pet-profile is the tap-through target from both search results and
  // discover moments; if it ever became a modal we would be back to
  // modal-over-modal the moment the photo viewer opened on top of it.
  expect(optionsFor("pet-profile")).not.toMatch(/presentation:\s*"modal"/);
});
