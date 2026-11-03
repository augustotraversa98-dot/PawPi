// Keyboard-avoidance audit. Source-level (like the *.contract.test.js suites): it parses each
// screen's JSX to find which scroll container encloses every <TextInput>, so a regression to a
// plain <ScrollView> (input never scrolled above the keyboard) or a new multiline field in a
// Modal with no keyboard handling fails CI. See KeyboardAwareScrollView.test.js for behaviour.
//
// Why a plain ScrollView is the bug: React Native never scrolls a focused TextInput into view,
// and KeyboardAvoidingView measures against the screen — not a pageSheet — so inside a sheet it
// under-pads by the sheet's top offset. KeyboardAwareScrollView measures in window coordinates.

const fs = require("fs");
const path = require("path");

const SRC = path.resolve(__dirname, "..");

const TAGS = [
  "ScrollView",
  "FlatList",
  "SectionList",
  "KeyboardAvoidingView",
  "Modal",
  "KeyboardAwareScrollView",
  "RefreshableScrollView",
  "KeyboardSafeFormModal",
  "TextInput",
];
const TAG_RE = new RegExp(`<(/?)(${TAGS.join("|")})\\b`, "g");
// Containers that scroll the focused input above the keyboard.
const AWARE = new Set([
  "KeyboardAwareScrollView",
  "RefreshableScrollView", // wraps KeyboardAwareScrollView
  "KeyboardSafeFormModal", // KeyboardAwareScrollView inside
]);
const PLAIN_SCROLLERS = new Set(["ScrollView", "FlatList", "SectionList"]);

/** Every <TextInput> in `src` with its enclosing audited tags (outermost first). */
function analyze(src) {
  const stack = [];
  const inputs = [];
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(src))) {
    const [, closing, name] = m;
    const line = src.slice(0, m.index).split("\n").length;
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    // End of the opening tag: first `>` outside `{…}`.
    let i = m.index + m[0].length;
    let depth = 0;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    const opening = src.slice(m.index, i + 1);
    const selfClosing = src[i - 1] === "/";
    if (name === "TextInput") {
      inputs.push({
        line,
        multiline: /\bmultiline\b/.test(opening),
        ancestors: stack.map((s) => s.name),
      });
    } else if (!selfClosing) {
      const presentation = /presentationStyle="(\w+)"/.exec(opening);
      stack.push({ name, sheet: presentation ? presentation[1] : null, line });
    }
  }
  return inputs;
}

const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");

// ── Screens fixed in this change (input sat in a plain ScrollView) ──────────────────────
const FIXED = [
  "components/Feed/PostComposerModal.jsx",
  "components/Health/Pee/PeeTrackerModal.jsx",
  "components/Health/Poo/PooTrackerModal.jsx",
  "components/Health/Weight/WeightModal.jsx",
  "components/Health/WellnessCheck/WellnessLogModal.jsx",
  "components/Health/Reminders/MedicalCareIssueModal.jsx",
  "components/Health/Reminders/MedicalCareRoutineModal.jsx",
  "components/Health/Reminders/MedicationRoutineModal.jsx",
  "components/Health/Reminders/PreventiveCareRoutineModal.jsx",
  "components/Health/Reminders/VaccineRoutineModal.jsx",
  "components/Health/Reminders/WalkRoutineModal.jsx",
  "app/nearby-walks.jsx",
];

describe("fixed screens keep their text inputs inside a KeyboardAwareScrollView", () => {
  it.each(FIXED)("%s", (rel) => {
    const src = read(rel);
    expect(src).toMatch(/KeyboardAwareScrollView/);
    const offenders = analyze(src).filter(
      (input) =>
        input.ancestors.some((a) => PLAIN_SCROLLERS.has(a)) &&
        !input.ancestors.some((a) => AWARE.has(a)),
    );
    expect(offenders).toEqual([]);
  });

  // pageSheet: KeyboardAvoidingView under-pads by the sheet's top offset, so the scroll view
  // is the one mechanism. (Full-screen modals keep their KeyboardAvoidingView — it is correct
  // there and cooperates with the scroll view.)
  it.each([
    "components/Feed/PostComposerModal.jsx",
    "components/Health/Pee/PeeTrackerModal.jsx",
    "components/Health/Poo/PooTrackerModal.jsx",
    "components/Health/Weight/WeightModal.jsx",
    "components/Health/WellnessCheck/WellnessLogModal.jsx",
  ])("%s does not stack a KeyboardAvoidingView on its pageSheet", (rel) => {
    const src = read(rel);
    expect(src).toMatch(/presentationStyle="pageSheet"/);
    expect(src).not.toMatch(/<KeyboardAvoidingView\b/);
  });
});

// ── Guard: a multiline field in a Modal needs keyboard handling ─────────────────────────
// Multiline fields are the ones that grow and sit lowest in a form. Anything listed here was
// audited and intentionally left: the field is not inside a scroller, so there is nothing to
// scroll — the container itself is lifted by the keyboard (full-screen frame, where
// KeyboardAvoidingView / KeyboardAvoidingAnimatedView measure correctly).
const INTENTIONALLY_UNSCROLLED = {
  "components/Feed/BarkModal.jsx":
    "composer is pinned below the list in a full-screen overlay; KeyboardAvoidingView lifts it",
  "components/Providers/WriteReviewModal.jsx":
    "short bottom sheet, full-screen overlay; KeyboardAvoidingView lifts it",
  "components/Pets/CaregiverLogWalkModal.jsx":
    "short bottom sheet, full-screen overlay; KeyboardAvoidingAnimatedView lifts it",
  "app/service/walking.jsx":
    "short bottom sheet (one multiline note), full-screen overlay; KeyboardAvoidingAnimatedView lifts it",
};

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__create") continue;
      sourceFiles(full, out);
    } else if (/\.(jsx?|tsx?)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function guardViolations() {
  const violations = [];
  for (const file of sourceFiles(SRC)) {
    const src = fs.readFileSync(file, "utf8");
    if (!/multiline/.test(src) || !/<Modal\b|<KeyboardSafeFormModal\b/.test(src)) continue;
    const rel = path.relative(SRC, file).split(path.sep).join("/");
    const fileHasAware = /<(KeyboardAwareScrollView|RefreshableScrollView|KeyboardSafeFormModal)\b/.test(src);
    for (const input of analyze(src)) {
      if (!input.multiline) continue;
      // Only fields inside a Modal (or a helper that lives in a file with one) are in scope;
      // a full-screen route's own composer is lifted by its screen-level KeyboardAvoidingView.
      const inModal = input.ancestors.some((a) => a === "Modal" || a === "KeyboardSafeFormModal");
      if (input.ancestors.length > 0 && !inModal) continue;
      const covered = input.ancestors.some((a) => AWARE.has(a));
      // A field defined in a helper component outside the Modal JSX has no ancestors in this
      // file; it is covered when the file wraps its modal content in an aware scroller.
      const helper = input.ancestors.length === 0 && fileHasAware;
      if (!covered && !helper && !(rel in INTENTIONALLY_UNSCROLLED)) {
        violations.push(`${rel}:${input.line}`);
      }
    }
  }
  return violations;
}

describe("guard: multiline TextInput inside a Modal", () => {
  it("is wrapped in KeyboardAwareScrollView (or listed as intentionally unscrolled)", () => {
    // Failing here means a new multiline field in a Modal has no keyboard handling: wrap its
    // scroll content in KeyboardAwareScrollView (or KeyboardSafeFormModal). Don't add to the
    // allowlist unless the field is NOT in a scroller and its full-screen container is lifted.
    expect(guardViolations()).toEqual([]);
  });

  it("every allowlisted file still exists and still has a multiline Modal field", () => {
    for (const rel of Object.keys(INTENTIONALLY_UNSCROLLED)) {
      const src = read(rel);
      expect(src).toMatch(/multiline/);
      expect(src).toMatch(/<Modal\b/);
    }
  });

  it("analyzer sanity: sees through nesting and flags a plain ScrollView", () => {
    const good = `<Modal><KeyboardAvoidingView><KeyboardAwareScrollView><View><TextInput multiline /></View></KeyboardAwareScrollView></KeyboardAvoidingView></Modal>`;
    const bad = `<Modal presentationStyle="pageSheet"><ScrollView><TextInput multiline value={a > b ? 1 : 2} /></ScrollView></Modal>`;
    expect(analyze(good)[0].ancestors).toEqual([
      "Modal",
      "KeyboardAvoidingView",
      "KeyboardAwareScrollView",
    ]);
    const [flagged] = analyze(bad);
    expect(flagged.multiline).toBe(true);
    expect(flagged.ancestors).toEqual(["Modal", "ScrollView"]);
  });
});
