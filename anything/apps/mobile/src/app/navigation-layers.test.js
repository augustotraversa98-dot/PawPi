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

// ── Rule: a screen you navigate ONWARD from is a normal card, never a modal ───────────────────
//
// Notifications (→ weekly digest, health, walker walks, welcome-back, …) and Messages (→ chat)
// were root `presentation: "modal"` screens that router.push'd onward, stacking a second layer on
// top of the sheet. The general guard below reads EVERY layout in the app: any screen declared
// with a modal-style presentation must be a leaf — it may not push/navigate/link anywhere.

const appDir = __dirname;

function layoutFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) layoutFiles(full, out);
    else if (/^_layout\.jsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

const MODAL_PRESENTATION = /presentation:\s*["'](modal|transparentModal|fullScreenModal|formSheet|pageSheet|containedModal|containedTransparentModal)["']/;

// Every <Stack.Screen name="x" ...> in a layout, with its source text.
function screenDeclarations(layoutPath) {
  const src = fs.readFileSync(layoutPath, "utf8");
  const out = [];
  const re = /<Stack\.Screen\s+name=(?:"|\{")([\w()/-]+)(?:"|"\})([\s\S]*?)\/>/g;
  let m;
  while ((m = re.exec(src))) out.push({ name: m[1], text: m[2] });
  return { src, screens: out };
}

function screenSource(layoutPath, name) {
  const dir = path.dirname(layoutPath);
  for (const candidate of [`${name}.jsx`, path.join(name, "index.jsx")]) {
    const p = path.join(dir, candidate);
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  }
  return null;
}

// A screen "navigates onward" when it pushes/navigates/replaces to another route or renders a Link.
const NAVIGATES_ONWARD = /router\.(push|navigate|replace)\(|<Link[\s>]|\bhref=/;

test("no layout applies a modal presentation to a whole navigator (screenOptions)", () => {
  for (const file of layoutFiles(appDir)) {
    const src = fs.readFileSync(file, "utf8");
    const screenOptions = /screenOptions=\{\{([\s\S]*?)\}\}/.exec(src);
    if (screenOptions) {
      expect({ file: path.relative(appDir, file), modal: MODAL_PRESENTATION.test(screenOptions[1]) }).toEqual({
        file: path.relative(appDir, file),
        modal: false,
      });
    }
  }
});

test("any screen declared as a modal/sheet is a leaf — it never navigates onward", () => {
  const offenders = [];
  for (const file of layoutFiles(appDir)) {
    const { screens } = screenDeclarations(file);
    for (const { name, text } of screens) {
      if (!MODAL_PRESENTATION.test(text)) continue;
      const source = screenSource(file, name);
      if (source && NAVIGATES_ONWARD.test(source)) {
        offenders.push(`${path.relative(appDir, file)} → "${name}" is a modal but navigates onward`);
      }
    }
  }
  expect(offenders).toEqual([]);
});

test("notifications and messages (both push onward) are cards, not modals", () => {
  expect(optionsFor("notifications")).not.toMatch(MODAL_PRESENTATION);
  expect(optionsFor("messages")).not.toMatch(MODAL_PRESENTATION);
  // …and they really do push onward, which is why they must not be modals.
  expect(NAVIGATES_ONWARD.test(fs.readFileSync(path.join(appDir, "notifications.jsx"), "utf8"))).toBe(true);
  expect(NAVIGATES_ONWARD.test(fs.readFileSync(path.join(appDir, "messages.jsx"), "utf8"))).toBe(true);
});

test("the screens notifications opens are cards (one back stack, back returns to Notifications)", () => {
  // weekly-digest / welcome-back / walker-walks / health are all reached by router.push from the
  // inbox. None may be declared as a modal anywhere, or Notifications → X would stack two layers.
  const declared = {};
  for (const file of layoutFiles(appDir)) {
    for (const { name, text } of screenDeclarations(file).screens) declared[name] = text;
  }
  for (const name of ["weekly-digest", "welcome-back", "walker-walks", "walk-live", "chat", "pet-profile"]) {
    if (name in declared) expect(declared[name]).not.toMatch(MODAL_PRESENTATION);
  }
});

test("the More tab keeps its own nested stack with index as the landing page", () => {
  // Converting notifications/messages to cards must not disturb the More tab root: the More stack
  // still declares `index` first and pins it as the initial route.
  const moreLayout = fs.readFileSync(path.join(appDir, "(tabs)", "more", "_layout.jsx"), "utf8");
  expect(moreLayout).toMatch(/initialRouteName:\s*"index"/);
  expect(moreLayout.indexOf('name="index"')).toBeGreaterThan(-1);
  expect(moreLayout.indexOf('name="index"')).toBeLessThan(moreLayout.indexOf('name="hub"'));
});
