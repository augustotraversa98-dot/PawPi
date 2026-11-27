// KEYBOARD-SAFETY GUARD — fails the build when a screen with a text field bypasses the shared
// keyboard handling, so "the keyboard hides the field" cannot silently come back (it has been
// "fixed" repeatedly; see docs/keyboard-convention.md for the convention and why).
//
// Source-level like keyboardAvoidance.audit.test.js: jest cannot lay anything out, so we pin the
// RULES by scanning every src/**/*.{js,jsx} file that renders a <TextInput>.
//
// Rules
//  1. Every file with a <TextInput> must use a shared keyboard-safe container (KeyboardSafeSheet,
//     KeyboardSafeFormModal, KeyboardAwareScrollView, RefreshableScrollView, or — full-screen routes
//     with a pinned composer — KeyboardAvoidingView / KeyboardAvoidingAnimatedView), or be listed in
//     FIELD_ONLY (a small field component hosted inside such a container) with a reason.
//  2. A <TextInput> must never sit inside a plain <ScrollView>/<FlatList>/<SectionList> with no
//     keyboard-aware ancestor (RN never scrolls a focused input into view).
//  3. A <Modal> that is `transparent` (bottom sheet / overlay) and holds a <TextInput> must be built
//     with KeyboardSafeSheet / KeyboardSafeFormModal, unless listed in LEGACY_TRANSPARENT_MODALS.
//  4. A hand-rolled <Modal> must not pair a percentage `height`/`maxHeight` sheet with a
//     <KeyboardAvoidingView>: that is exactly the layout that left a sliver of scroll area (the
//     Quick Check bug). Use KeyboardSafeSheet.
//  5. Allowlists must stay honest: every entry still exists and still triggers the rule it excuses.
//  6. No component declared INSIDE another component may hold or wrap a text field (and none at all
//     in a file that renders a <TextInput>). It is a new component type on every render, so React
//     remounts it on each keystroke and the keyboard closes (EditMedicalProfileModal, build 33).
//  7. A KeyboardAwareScrollView / RefreshableScrollView inside a pageSheet <Modal> passes
//     `inPageSheet`: iOS measures relative to the sheet there, so without it the keyboard still
//     covers the focused field.

const fs = require("fs");
const path = require("path");
// Already installed as a dependency of the babel transform jest runs with.
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const SRC = path.resolve(__dirname, "..");

// A field that lives in a small component; the SCREEN that hosts it provides the keyboard handling
// (KeyboardAwareScrollView / RefreshableScrollView), or it is a search bar at the top of a list that
// the keyboard never covers.
const FIELD_ONLY = {
  "app/messages.jsx": "search bar pinned at the top of the conversation list; the keyboard never covers it",
  "app/follows.jsx": "search bar at the top of a list; the keyboard never covers it",
  "app/search.jsx": "search field at the top of the search overlay; results list sits below it",
  "components/BreedPicker.jsx": "searchable breed list; hosted in onboarding / profile-edit / AddDogModal (all KeyboardAwareScrollView or KeyboardSafeSheet)",
  "components/Pets/RedeemInviteCard.jsx": "invite-code field hosted in pet-sharing (KeyboardAwareScrollView)",
  "components/Pets/BirthdayOrAgeField.jsx": "field component hosted in profile-edit and EditMedicalProfileModal (KeyboardAwareScrollView)",
  "components/Health/VetShare/VetSearch.jsx": "vet search field hosted in ShareWithVetSheet (KeyboardSafeFormModal)",
  "components/Health/PackFriendPicker.jsx": "field hosted in PackStreaksCard inside HealthToday (RefreshableScrollView)",
  "components/Health/LeaderboardCard.jsx": "field hosted inside HealthToday (RefreshableScrollView)",
  "components/Health/Reminders/SocialWalkSettings.jsx": "field hosted in WalkItem inside WalkRoutineModal (KeyboardAwareScrollView)",
  "components/Health/Reminders/WalkItem.jsx": "field hosted in WalkRoutineModal (KeyboardAwareScrollView)",
  "components/Health/Reminders/DurationPaceSelector.jsx": "field hosted in WalkItem inside WalkRoutineModal (KeyboardAwareScrollView)",
  "components/Map/MapLocationPicker.jsx": "address search over a map, hosted in LocationField / transport / WalkMapPicker; the map, not a form, sits below",
  "components/Providers/ProviderListControls.jsx": "search bar at the top of the provider list screens; the keyboard never covers it",
  "components/Providers/StorefrontPanels/StorefrontBrowse.jsx": "catalog search bar at the top of the storefront list; the keyboard never covers it",
};

// Hand-rolled transparent modals that predate KeyboardSafeSheet and were audited and left: each has
// no pinned form footer to starve of space, and is lifted by a keyboard-avoiding wrapper in a
// full-window modal (where the keyboard coordinates are correct). Migrate them when next touched.
const LEGACY_TRANSPARENT_MODALS = {
  "app/search.jsx": "fade overlay holding only the search field (see FIELD_ONLY)",
  "app/service/provider-post.jsx": "the <Modal> is a full-screen image viewer with NO input; the comment composer is a full-screen route lifted by a KeyboardAvoidingView",
  "components/Health/PhotoCheck/PhotoCheckCaptureModal.jsx": "full-screen (transparent={false}) multi-step capture flow; KeyboardAvoidingView + KeyboardAwareScrollView, fully lifted. TODO: move onto KeyboardSafeSheet",
  "components/Feed/BarkModal.jsx": "list + pinned comment composer; the composer is lifted by a KeyboardAvoidingView in the full-window overlay",
  "components/Services/ServicesDiscovery.jsx": "search field inside a bottom-sheet library sheet; lifted by KeyboardAvoidingAnimatedView",
};

const SAFE_CONTAINERS = [
  "KeyboardSafeSheet",
  "KeyboardSafeFormModal",
  "KeyboardAwareScrollView",
  "RefreshableScrollView",
  "KeyboardAvoidingView",
  "KeyboardAvoidingAnimatedView",
];
const AWARE = new Set([
  "KeyboardSafeSheet",
  "KeyboardSafeFormModal",
  "KeyboardAwareScrollView",
  "RefreshableScrollView",
]);
const PLAIN_SCROLLERS = new Set(["ScrollView", "FlatList", "SectionList"]);

const TAGS = [...PLAIN_SCROLLERS, ...SAFE_CONTAINERS, "Modal", "TextInput"];
const TAG_RE = new RegExp(`<(/?)(${TAGS.join("|")})\\b`, "g");

/** Every <TextInput> with the audited tags that enclose it (outermost first). */
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
        if (stack[i] === name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    let i = m.index + m[0].length;
    let depth = 0;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    const selfClosing = src[i - 1] === "/";
    if (name === "TextInput") inputs.push({ line, ancestors: [...stack] });
    else if (!selfClosing) stack.push(name);
  }
  return inputs;
}

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__create") continue;
      sourceFiles(full, out);
    } else if (/\.(jsx?)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const rel = (file) => path.relative(SRC, file).split(path.sep).join("/");
const uses = (src, tag) => new RegExp(`<${tag}\\b`).test(src);

const FILES = sourceFiles(SRC)
  .map((file) => ({ rel: rel(file), src: fs.readFileSync(file, "utf8") }))
  // The shared containers themselves are the implementation, not consumers.
  .filter((f) => !/^components\/(KeyboardAwareScrollView|KeyboardSafeSheet|KeyboardSafeFormModal|KeyboardAvoidingAnimatedView|RefreshableScrollView)\.jsx$/.test(f.rel));
const WITH_INPUT = FILES.filter((f) => uses(f.src, "TextInput"));

// Components that render a text field of their own: wrapping one counts like wrapping a TextInput.
const INPUT_TAGS = new Set([
  "TextInput",
  ...Object.keys(FIELD_ONLY)
    .filter((file) => file.startsWith("components/"))
    .map((file) => path.basename(file, ".jsx")),
]);

const holdsInput = (nodePath) => {
  let found = false;
  nodePath.traverse({
    JSXOpeningElement(p) {
      if (INPUT_TAGS.has(p.node.name.name)) found = true;
    },
  });
  return found;
};

const returnsJsx = (fnPath) => {
  if (/^JSX(Element|Fragment)$/.test(fnPath.node.body.type)) return true;
  let found = false;
  fnPath.traverse({
    JSXElement() {
      found = true;
    },
    JSXFragment() {
      found = true;
    },
  });
  return found;
};

/** Nested components that would remount a text field: ["line:Name", ...]. */
function unstableInputComponents(src) {
  const ast = parse(src, { sourceType: "module", plugins: ["jsx", "typescript"] });
  const fileHasInput = /<TextInput\b/.test(src);
  const usedAsElement = new Set();
  const wrapsInput = new Set();
  const passedAsComponentProp = new Set();
  traverse(ast, {
    JSXElement(p) {
      const name = p.node.openingElement.name.name;
      if (!name) return;
      usedAsElement.add(name);
      if (holdsInput(p)) wrapsInput.add(name);
    },
    JSXAttribute(p) {
      const value = p.node.value?.expression;
      if (/Component$|^component$/.test(p.node.name.name) && value?.type === "Identifier") {
        passedAsComponentProp.add(value.name);
      }
    },
  });

  const found = [];
  traverse(ast, {
    Function(p) {
      if (!p.getFunctionParent()) return;
      const parent = p.parentPath;
      let name = p.node.id?.name;
      let asProp = false;
      if (!name && parent.isVariableDeclarator()) name = parent.node.id.name;
      // const X = memo(...) / useCallback(...)
      if (!name && parent.isCallExpression() && parent.parentPath.isVariableDeclarator()) {
        name = parent.parentPath.node.id.name;
      }
      // ListHeaderComponent={() => ...}
      if (parent.isJSXExpressionContainer() && parent.parentPath.isJSXAttribute()) {
        const attribute = parent.parentPath.node.name.name;
        if (/Component$|^component$/.test(attribute)) {
          name = attribute;
          asProp = true;
        }
      }
      if (!name || !returnsJsx(p)) return;
      const isComponent =
        asProp || passedAsComponentProp.has(name) || (/^[A-Z]/.test(name) && usedAsElement.has(name));
      if (!isComponent) return;
      if (fileHasInput || wrapsInput.has(name) || holdsInput(p)) {
        found.push(`${p.node.loc.start.line}:${name}`);
      }
    },
  });
  return found;
}

/** Keyboard-aware scroll views inside a pageSheet Modal that lack `inPageSheet`: lines. */
function pageSheetScrollsWithoutFlag(src) {
  const ast = parse(src, { sourceType: "module", plugins: ["jsx", "typescript"] });
  const found = [];
  traverse(ast, {
    JSXOpeningElement(p) {
      const name = p.node.name.name;
      if (name !== "KeyboardAwareScrollView" && name !== "RefreshableScrollView") return;
      const sheet = p.findParent(
        (q) =>
          q.isJSXElement() &&
          q.node.openingElement.name.name === "Modal" &&
          q.node.openingElement.attributes.some(
            (a) =>
              a.name?.name === "presentationStyle" &&
              src.slice(a.start, a.end).includes("pageSheet"),
          ),
      );
      if (sheet && !p.node.attributes.some((a) => a.name?.name === "inPageSheet")) {
        found.push(p.node.loc.start.line);
      }
    },
  });
  return found;
}

describe("keyboard-safety guard", () => {
  it("scans a plausible number of text-field files (guards against a broken scanner)", () => {
    expect(WITH_INPUT.length).toBeGreaterThan(40);
  });

  it("rule 1: every file with a <TextInput> uses a shared keyboard-safe container or is a listed field component", () => {
    const offenders = WITH_INPUT.filter(
      (f) => !SAFE_CONTAINERS.some((tag) => uses(f.src, tag)) && !(f.rel in FIELD_ONLY),
    ).map((f) => f.rel);
    // A failure here means a NEW screen renders a text field with no keyboard handling. Wrap its
    // scroll content in <KeyboardAwareScrollView> (or build the sheet on <KeyboardSafeSheet>); see
    // docs/keyboard-convention.md. Only add to FIELD_ONLY for a small field component whose host
    // screen already handles the keyboard, with that reason spelled out.
    expect(offenders).toEqual([]);
  });

  it("rule 2: no <TextInput> sits in a plain ScrollView/FlatList/SectionList without a keyboard-aware ancestor", () => {
    const offenders = [];
    for (const f of WITH_INPUT) {
      for (const input of analyze(f.src)) {
        const inPlain = input.ancestors.some((a) => PLAIN_SCROLLERS.has(a));
        const aware = input.ancestors.some((a) => AWARE.has(a));
        if (inPlain && !aware) offenders.push(`${f.rel}:${input.line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("rule 3: a transparent Modal with a text field is built on KeyboardSafeSheet / KeyboardSafeFormModal (or listed)", () => {
    const offenders = WITH_INPUT.filter(
      (f) =>
        /<Modal\b[^>]*\btransparent\b/.test(f.src) &&
        !uses(f.src, "KeyboardSafeSheet") &&
        !uses(f.src, "KeyboardSafeFormModal") &&
        !(f.rel in LEGACY_TRANSPARENT_MODALS),
    ).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("rule 4: no hand-rolled percentage-height sheet inside a KeyboardAvoidingView (the Quick Check layout)", () => {
    const offenders = FILES.filter(
      (f) =>
        /<Modal\b/.test(f.src) &&
        /<KeyboardAvoiding(Animated)?View\b/.test(f.src) &&
        /\b(height|maxHeight): "\d+%"/.test(f.src) &&
        !(f.rel in LEGACY_TRANSPARENT_MODALS) &&
        !(f.rel in FIELD_ONLY),
    ).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("rule 5: allowlists are honest — every entry exists and still needs its exception", () => {
    const byRel = Object.fromEntries(FILES.map((f) => [f.rel, f]));
    for (const key of Object.keys(FIELD_ONLY)) {
      expect(byRel[key]).toBeDefined();
      expect(uses(byRel[key].src, "TextInput")).toBe(true);
      // If a file starts using a shared container itself the exception is obsolete.
      expect(SAFE_CONTAINERS.some((tag) => uses(byRel[key].src, tag))).toBe(false);
    }
    for (const key of Object.keys(LEGACY_TRANSPARENT_MODALS)) {
      expect(byRel[key]).toBeDefined();
      expect(/<Modal\b/.test(byRel[key].src)).toBe(true);
      expect(uses(byRel[key].src, "KeyboardSafeSheet")).toBe(false);
      expect(uses(byRel[key].src, "KeyboardSafeFormModal")).toBe(false);
    }
  });

  it("rule 6: no component declared inside a component holds or wraps a text field", () => {
    const offenders = FILES.flatMap((f) =>
      unstableInputComponents(f.src).map((hit) => `${f.rel}:${hit}`),
    );
    // Fix: move the component to module scope and pass what it needs as props (or call it as a
    // plain function, {renderRow()}, so React sees no new component type).
    expect(offenders).toEqual([]);
  });

  it("rule 7: a keyboard-aware scroll view inside a pageSheet modal passes inPageSheet", () => {
    const offenders = FILES.flatMap((f) =>
      pageSheetScrollsWithoutFlag(f.src).map((line) => `${f.rel}:${line}`),
    );
    expect(offenders).toEqual([]);
  });

  it("every migrated form sheet really renders through the shared container", () => {
    // Anything that imports KeyboardSafeSheet must actually render it (no dead import left behind
    // by a half-finished migration).
    const dead = FILES.filter(
      (f) => /import KeyboardSafeSheet\b/.test(f.src) && !uses(f.src, "KeyboardSafeSheet"),
    ).map((f) => f.rel);
    expect(dead).toEqual([]);
  });

  describe("analyzer sanity", () => {
    it("flags a pageSheet scroll view without inPageSheet", () => {
      const bad = `const F = () => <Modal presentationStyle="pageSheet"><KeyboardAwareScrollView /></Modal>;`;
      const good = `const F = () => <Modal presentationStyle="pageSheet"><KeyboardAwareScrollView inPageSheet /></Modal>;`;
      const other = `const F = () => <Modal><KeyboardAwareScrollView /></Modal>;`;
      expect(pageSheetScrollsWithoutFlag(bad)).toEqual([1]);
      expect(pageSheetScrollsWithoutFlag(good)).toEqual([]);
      expect(pageSheetScrollsWithoutFlag(other)).toEqual([]);
    });

    it("flags nested components around text fields and clears the safe shapes", () => {
      const inside = `function F() { const Field = () => <TextInput />; return <View><Field /></View>; }`;
      const wrapper = `function F() { const Section = ({ children }) => <View>{children}</View>;
        return <Section><BirthdayOrAgeField /></Section>; }`;
      const listProp = `function F() { return <List ListHeaderComponent={() => <TextInput />} />; }`;
      const byName = `function F() { const Header = () => <TextInput />; return <List ListHeaderComponent={Header} />; }`;
      expect(unstableInputComponents(inside)).toEqual(["1:Field"]);
      expect(unstableInputComponents(wrapper)).toEqual(["1:Section"]);
      expect(unstableInputComponents(listProp)).toEqual(["1:ListHeaderComponent"]);
      expect(unstableInputComponents(byName)).toEqual(["1:Header"]);

      const moduleScope = `const Field = () => <TextInput />; function F() { return <Field />; }`;
      const renderFunction = `function F() { const renderField = () => <TextInput />; return <View>{renderField()}</View>; }`;
      const unrelated = `function F() { const Row = () => <Text />; return <Row />; }`;
      expect(unstableInputComponents(moduleScope)).toEqual([]);
      expect(unstableInputComponents(renderFunction)).toEqual([]);
      expect(unstableInputComponents(unrelated)).toEqual([]);
    });

    it("flags a TextInput in a plain ScrollView and clears one under a KeyboardAwareScrollView", () => {
      const bad = `<Modal><ScrollView><View><TextInput value={a > b ? 1 : 2} /></View></ScrollView></Modal>`;
      const good = `<ScrollView><KeyboardAwareScrollView><TextInput /></KeyboardAwareScrollView></ScrollView>`;
      expect(analyze(bad)[0].ancestors).toEqual(["Modal", "ScrollView"]);
      const [g] = analyze(good);
      expect(g.ancestors.some((a) => AWARE.has(a))).toBe(true);
    });
  });
});
