import KeyboardAwareScrollView, {
  KEYBOARD_INPUT_MARGIN,
  computeKeyboardPadding,
  computeScrollDelta,
} from "./KeyboardAwareScrollView";

// All coordinates are window coordinates, the same space the keyboard frame
// (endCoordinates.screenY) is reported in. Example geometry: an 852pt-tall
// screen with a 336pt keyboard → keyboard top at y=516.
const KEYBOARD_TOP = 516;

describe("computeKeyboardPadding", () => {
  it("pads by the full keyboard overlap when the scroll view runs to the screen bottom", () => {
    // Full-screen modal: scroll view bottom at 852.
    expect(computeKeyboardPadding(852, KEYBOARD_TOP)).toBe(336);
  });

  it("pads only the remaining overlap when an ancestor already lifted the layout", () => {
    // e.g. a KeyboardAvoidingView inside a pageSheet under-pads by the
    // sheet's top offset; the residual overlap is what's left to absorb.
    expect(computeKeyboardPadding(516 + 54, KEYBOARD_TOP)).toBe(54);
  });

  it("returns 0 when the scroll view already sits above the keyboard", () => {
    expect(computeKeyboardPadding(500, KEYBOARD_TOP)).toBe(0);
    expect(computeKeyboardPadding(KEYBOARD_TOP, KEYBOARD_TOP)).toBe(0);
  });
});

describe("computeScrollDelta", () => {
  it("scrolls a covered input above the keyboard plus the margin", () => {
    // Input bottom at 700 is 184pt under the keyboard top.
    expect(computeScrollDelta(700, KEYBOARD_TOP)).toBe(
      184 + KEYBOARD_INPUT_MARGIN,
    );
  });

  it("nudges an input sitting exactly at the keyboard edge by the margin", () => {
    expect(computeScrollDelta(KEYBOARD_TOP, KEYBOARD_TOP)).toBe(
      KEYBOARD_INPUT_MARGIN,
    );
  });

  it("returns 0 when the input is already clearly visible", () => {
    expect(computeScrollDelta(400, KEYBOARD_TOP)).toBe(0);
  });

  it("respects a custom margin", () => {
    expect(computeScrollDelta(600, KEYBOARD_TOP, 0)).toBe(84);
  });
});

describe("KeyboardAwareScrollView module", () => {
  it("exports a component as default", () => {
    expect(KeyboardAwareScrollView).toBeDefined();
    // forwardRef components are objects with a render function.
    expect(typeof KeyboardAwareScrollView.render).toBe("function");
  });
});
