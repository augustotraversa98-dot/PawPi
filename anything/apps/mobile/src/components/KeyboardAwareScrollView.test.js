import React from "react";
import { Dimensions, Keyboard, TextInput as RNTextInput } from "react-native";
import { render, act, fireEvent } from "@testing-library/react-native";
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

// Regression (Quick Check "notes field hidden"): with a pinned footer between the scroll view and
// the keyboard, an input can be above the keyboard yet below the scroll view's bottom edge —
// hidden under the footer. It must be scrolled into the VISIBLE area, not just above the keyboard.
describe("KeyboardAwareScrollView — scrolls into the visible area, not just above the keyboard", () => {
  it("scrolls an input that sits under a pinned footer", () => {
    const handlers = {};
    const addSpy = jest
      .spyOn(Keyboard, "addListener")
      .mockImplementation((name, cb) => {
        handlers[name] = cb;
        return { remove: () => {} };
      });
    // Input bottom at y=480: above the keyboard top (516) but below the scroll view bottom (400).
    const focusSpy = jest
      .spyOn(RNTextInput.State, "currentlyFocusedInput")
      .mockReturnValue({ measureInWindow: (cb) => cb(20, 440, 300, 40) });

    const ref = React.createRef();
    render(
      <KeyboardAwareScrollView ref={ref}>
        <RNTextInput />
      </KeyboardAwareScrollView>,
    );
    ref.current.getNativeScrollRef = () => ({
      measureInWindow: (cb) => cb(0, 0, 300, 400),
    });
    ref.current.scrollTo = jest.fn();

    act(() => {
      handlers.keyboardWillShow({ endCoordinates: { screenY: 516 } });
    });

    expect(ref.current.scrollTo).toHaveBeenCalledWith({
      y: 480 + KEYBOARD_INPUT_MARGIN - 400,
      animated: true,
    });
    addSpy.mockRestore();
    focusSpy.mockRestore();
  });
});

// Night run 2026-11-25: with the keyboard already up, the field the user moves to (or the
// line they are typing in a growing field) has to stay visible, and only the scroll view
// that holds that field may move.
describe("KeyboardAwareScrollView — follows the focused field while the keyboard is up", () => {
  let handlers;

  beforeEach(() => {
    jest.useFakeTimers();
    handlers = {};
    jest.spyOn(Keyboard, "addListener").mockImplementation((name, cb) => {
      (handlers[name] = handlers[name] || []).push(cb);
      return { remove: () => {} };
    });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const emit = (name, screenY = KEYBOARD_TOP) =>
    act(() => {
      (handlers[name] || []).forEach((cb) =>
        cb({ endCoordinates: { screenY, height: 852 - screenY } }),
      );
    });
  const settle = () => act(() => jest.advanceTimersByTime(500));

  // A scroll view whose window bottom is 852 (keyboard top 516 covers its lower part).
  const fakeScroll = (ref) => {
    ref.current.getNativeScrollRef = () => ({
      measureInWindow: (cb) => cb(0, 100, 390, 752),
    });
    ref.current.getInnerViewRef = () => ({});
    ref.current.scrollTo = jest.fn();
    return ref.current.scrollTo;
  };
  const input = (y, { contained = true, height = 40 } = {}) => ({
    measureInWindow: (cb) => cb(20, y, 300, height),
    measureLayout: (_node, ok, fail) => (contained ? ok() : fail()),
  });
  const focus = (value) =>
    jest.spyOn(RNTextInput.State, "currentlyFocusedInput").mockReturnValue(value);

  const renderOne = (props) => {
    const ref = React.createRef();
    const api = render(
      <KeyboardAwareScrollView ref={ref} testID="kasv" {...props}>
        <RNTextInput />
      </KeyboardAwareScrollView>,
    );
    return { api, ref, scrollTo: fakeScroll(ref) };
  };

  it("scrolls to the next field when focus moves, without a new keyboard event", () => {
    const onFocus = jest.fn();
    const { api, scrollTo } = renderOne({ onFocus });
    focus(input(300));
    emit("keyboardWillShow");
    expect(scrollTo).not.toHaveBeenCalled(); // already visible

    focus(input(600));
    fireEvent(api.getByTestId("kasv"), "focus", { nativeEvent: {} });
    settle();

    expect(scrollTo).toHaveBeenCalledWith({
      y: 640 + KEYBOARD_INPUT_MARGIN - KEYBOARD_TOP,
      animated: true,
    });
    expect(onFocus).toHaveBeenCalled();
  });

  it("follows the caret when a multiline field grows", () => {
    const onContentSizeChange = jest.fn();
    const { api, scrollTo } = renderOne({ onContentSizeChange });
    focus(input(420, { height: 40 }));
    emit("keyboardWillShow");
    expect(scrollTo).not.toHaveBeenCalled();

    focus(input(420, { height: 120 })); // two more lines
    fireEvent(api.getByTestId("kasv"), "contentSizeChange", 390, 900);
    settle();

    expect(scrollTo).toHaveBeenCalledWith({
      y: 540 + KEYBOARD_INPUT_MARGIN - KEYBOARD_TOP,
      animated: true,
    });
    expect(onContentSizeChange).toHaveBeenCalledWith(390, 900);
  });

  it("re-adjusts when the keyboard gets taller (iOS frame change)", () => {
    const { scrollTo } = renderOne();
    focus(input(420));
    emit("keyboardWillShow");
    emit("keyboardWillChangeFrame", 440);
    settle();
    expect(scrollTo).toHaveBeenCalledWith({
      y: 460 + KEYBOARD_INPUT_MARGIN - 440,
      animated: true,
    });
  });

  // Simulator measurement of the Weight sheet: everything is reported 62pt higher than it
  // is on screen, so without the correction a covered field looks visible.
  it("corrects sheet-relative measurements inside a pageSheet", () => {
    jest.spyOn(Dimensions, "get").mockReturnValue({ width: 440, height: 956 });
    const sheetScroll = (ref) => {
      const scrollTo = fakeScroll(ref);
      ref.current.getNativeScrollRef = () => ({
        measureInWindow: (cb) => cb(0, 180, 440, 714),
      });
      return scrollTo;
    };
    const inSheet = renderOne({ inPageSheet: true });
    sheetScroll(inSheet.ref);
    focus(input(484, { height: 80 })); // really spans 546..626; keyboard top 611
    emit("keyboardWillShow", 611);

    expect(inSheet.ref.current.scrollTo).toHaveBeenCalledWith({
      y: 626 + KEYBOARD_INPUT_MARGIN - 611,
      animated: true,
    });
  });

  it("does nothing on focus or content changes while the keyboard is down", () => {
    const { api, scrollTo } = renderOne();
    focus(input(600));
    fireEvent(api.getByTestId("kasv"), "focus", { nativeEvent: {} });
    fireEvent(api.getByTestId("kasv"), "contentSizeChange", 390, 900);
    settle();
    emit("keyboardWillShow");
    scrollTo.mockClear();
    emit("keyboardWillHide", 852);
    fireEvent(api.getByTestId("kasv"), "contentSizeChange", 390, 950);
    settle();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("does not scroll for a field that is not inside it (screen behind a modal)", () => {
    const { scrollTo } = renderOne();
    focus(input(600, { contained: false }));
    emit("keyboardWillShow");
    settle();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("only the innermost scroll view moves when forms are nested", () => {
    const outer = React.createRef();
    const inner = React.createRef();
    const api = render(
      <KeyboardAwareScrollView ref={outer} testID="outer">
        <KeyboardAwareScrollView ref={inner} testID="inner">
          <RNTextInput />
        </KeyboardAwareScrollView>
      </KeyboardAwareScrollView>,
    );
    const outerScroll = fakeScroll(outer);
    const innerScroll = fakeScroll(inner);
    focus(input(600)); // contained in both, as far as the native tree knows

    // One native focus event, bubbling innermost first.
    const event = { nativeEvent: {} };
    fireEvent(api.getByTestId("inner"), "focus", event);
    fireEvent(api.getByTestId("outer"), "focus", event);
    emit("keyboardWillShow");
    settle();

    expect(innerScroll).toHaveBeenCalled();
    expect(outerScroll).not.toHaveBeenCalled();
  });
});
