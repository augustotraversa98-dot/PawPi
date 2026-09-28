import React from "react";
import { Keyboard, TextInput as RNTextInput } from "react-native";
import { render, act } from "@testing-library/react-native";
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

  // Regression (onboarding name-field crash): a native measureInWindow callback
  // can hand back undefined coords for a not-yet-laid-out node. The old helper
  // returned NaN, which then flowed into a paddingBottom style — a Yoga crash on
  // the New Architecture. It must degrade to 0, never NaN.
  it("returns 0 (never NaN) when a measurement is missing/non-finite", () => {
    expect(computeKeyboardPadding(undefined, KEYBOARD_TOP)).toBe(0);
    expect(computeKeyboardPadding(NaN, KEYBOARD_TOP)).toBe(0);
    expect(computeKeyboardPadding(852, undefined)).toBe(0);
    expect(computeKeyboardPadding(NaN, NaN)).toBe(0);
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

  // Regression (onboarding name-field crash): a non-finite measurement must
  // yield 0 so a NaN scroll offset never reaches scrollTo.
  it("returns 0 (never NaN) when a measurement is missing/non-finite", () => {
    expect(computeScrollDelta(undefined, KEYBOARD_TOP)).toBe(0);
    expect(computeScrollDelta(NaN, KEYBOARD_TOP)).toBe(0);
    expect(computeScrollDelta(700, undefined)).toBe(0);
  });
});

describe("KeyboardAwareScrollView module", () => {
  it("exports a component as default", () => {
    expect(KeyboardAwareScrollView).toBeDefined();
    // forwardRef components are objects with a render function.
    expect(typeof KeyboardAwareScrollView.render).toBe("function");
  });
});

// Regression (onboarding name-field crash): tapping the name field on the first
// onboarding step opens the keyboard while the wizard is still settling, so the
// focused input can be measured after it has detached. The keyboard-show handler
// must never let that throw out of the native callback and crash the screen.
describe("KeyboardAwareScrollView — keyboard-show handler is crash-proof", () => {
  it("swallows a throw from measuring a stale focused input", () => {
    const handlers = {};
    const addSpy = jest
      .spyOn(Keyboard, "addListener")
      .mockImplementation((name, cb) => {
        handlers[name] = cb;
        return { remove: () => {} };
      });
    // A focused input whose native measure throws — the detached-node reality.
    const staleMeasure = jest.fn(() => {
      throw new Error("stale native node");
    });
    const focusSpy = jest
      .spyOn(RNTextInput.State, "currentlyFocusedInput")
      .mockReturnValue({ measureInWindow: staleMeasure });

    const ref = React.createRef();
    render(
      <KeyboardAwareScrollView ref={ref}>
        <RNTextInput />
      </KeyboardAwareScrollView>,
    );

    // Deliver a synchronous scroll-host measurement so we reach the focused-input
    // branch (the one that throws on the stale node).
    ref.current.getNativeScrollRef = () => ({
      measureInWindow: (cb) => cb(0, 0, 300, 600),
    });
    ref.current.scrollTo = jest.fn();

    expect(() =>
      act(() => {
        handlers.keyboardWillShow({ endCoordinates: { screenY: 516 } });
      }),
    ).not.toThrow();

    // The stale node was actually measured (so the throw path was exercised)
    // and the crash was swallowed rather than propagated.
    expect(staleMeasure).toHaveBeenCalledTimes(1);

    addSpy.mockRestore();
    focusSpy.mockRestore();
  });
});
