// KeyboardSafeSheet — the shared shell every keyboard-bearing form sheet / full-screen form is
// built on (docs/keyboard-convention.md). Layout only reproduces on a device, so these tests pin
// the STRUCTURE the on-device behaviour depends on: footer outside the scroll view, a transparent
// full-window Modal (not pageSheet), taps-persist scroll body, a definite sheet height that grows
// when the keyboard opens, chrome that collapses, and a backdrop that dismisses the keyboard.

import React from "react";
import { Keyboard, Text, TextInput } from "react-native";
import { render, act, fireEvent, within } from "@testing-library/react-native";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

import KeyboardSafeSheet from "./KeyboardSafeSheet";
import { FOOTER_PADDING_KEYBOARD } from "@/utils/keyboardLayout";

const flat = (style) =>
  Array.isArray(style) ? Object.assign({}, ...style.flat(5).filter(Boolean)) : style || {};

let handlers;
let addSpy;
beforeEach(() => {
  handlers = {};
  addSpy = jest.spyOn(Keyboard, "addListener").mockImplementation((name, cb) => {
    handlers[name] = cb;
    return { remove: () => {} };
  });
});
afterEach(() => addSpy.mockRestore());

const openKeyboard = (screenY = 1000) =>
  act(() => {
    handlers.keyboardWillShow?.({ duration: 0, endCoordinates: { screenY, height: 334 } });
  });
const closeKeyboard = () =>
  act(() => {
    handlers.keyboardWillHide?.({ duration: 0 });
  });

function renderSheet(props = {}) {
  return render(
    <KeyboardSafeSheet
      visible
      onRequestClose={jest.fn()}
      header={<Text>HEADER</Text>}
      subheader={<Text>SUBHEADER</Text>}
      footer={<Text>FOOTER</Text>}
      {...props}
    >
      <TextInput testID="field" />
    </KeyboardSafeSheet>,
  );
}

describe("KeyboardSafeSheet structure", () => {
  it("presents in a transparent full-window Modal, never a pageSheet", () => {
    const { UNSAFE_getByType } = renderSheet();
    const { Modal } = require("react-native");
    const modal = UNSAFE_getByType(Modal);
    expect(modal.props.transparent).toBe(true);
    expect(modal.props.presentationStyle).toBeUndefined();
  });

  it("keeps the pinned footer OUTSIDE the scroll view, and the input INSIDE it", () => {
    const { getByTestId, queryByText } = renderSheet();
    const scroll = getByTestId("keyboard-sheet-scroll");
    expect(within(scroll).queryByText("FOOTER")).toBeNull();
    expect(within(scroll).queryByText("HEADER")).toBeNull();
    expect(within(scroll).getByTestId("field")).toBeTruthy();
    expect(within(getByTestId("keyboard-sheet-footer")).getByText("FOOTER")).toBeTruthy();
    expect(queryByText("HEADER")).toBeTruthy();
  });

  it("body keeps taps working while the keyboard is up and dismisses it on drag", () => {
    const { getByTestId } = renderSheet();
    const scroll = getByTestId("keyboard-sheet-scroll");
    expect(scroll.props.keyboardShouldPersistTaps).toBe("handled");
    expect(scroll.props.keyboardDismissMode).toBe("on-drag");
  });

  it("scroll body gets flex:1 inside a DEFINITE-height sheet (never a maxHeight-only parent)", () => {
    const { getByTestId } = renderSheet();
    expect(flat(getByTestId("keyboard-sheet-scroll").props.style).flex).toBe(1);
    const surface = flat(getByTestId("keyboard-sheet-surface").props.style);
    expect(typeof surface.height).toBe("number");
    expect(surface.maxHeight).toBeUndefined();
  });

  it("`fit` sheets use maxHeight and let the body shrink instead of filling", () => {
    const { getByTestId } = renderSheet({ fit: true });
    const surface = flat(getByTestId("keyboard-sheet-surface").props.style);
    expect(typeof surface.maxHeight).toBe("number");
    expect(surface.height).toBeUndefined();
    const scroll = flat(getByTestId("keyboard-sheet-scroll").props.style);
    expect(scroll.flex).toBeUndefined();
    expect(scroll.flexShrink).toBe(1);
  });

  it("screen variant fills the window and has no dim backdrop", () => {
    const { getByTestId, queryByTestId } = renderSheet({ variant: "screen" });
    expect(flat(getByTestId("keyboard-sheet-surface").props.style).flex).toBe(1);
    expect(queryByTestId("keyboard-sheet-backdrop")).toBeNull();
  });
});

describe("KeyboardSafeSheet with the keyboard up", () => {
  it("lifts the whole sheet by the real keyboard overlap and grows to fill the space", () => {
    const { getByTestId } = renderSheet();
    const before = flat(getByTestId("keyboard-sheet-surface").props.style).height;
    expect(flat(getByTestId("keyboard-sheet-root").props.style).paddingBottom).toBe(0);
    openKeyboard();
    const root = flat(getByTestId("keyboard-sheet-root").props.style);
    expect(root.paddingBottom).toBeGreaterThan(0);
    const after = flat(getByTestId("keyboard-sheet-surface").props.style).height;
    expect(Number.isFinite(after)).toBe(true);
    expect(after).not.toBe(before);
    closeKeyboard();
    expect(flat(getByTestId("keyboard-sheet-root").props.style).paddingBottom).toBe(0);
    expect(flat(getByTestId("keyboard-sheet-surface").props.style).height).toBe(before);
  });

  it("collapses the sub-header and shrinks the footer's bottom padding while typing", () => {
    const { getByTestId, queryByText } = renderSheet();
    expect(queryByText("SUBHEADER")).toBeTruthy();
    expect(flat(getByTestId("keyboard-sheet-footer").props.style).paddingBottom).toBe(34 + 20);
    openKeyboard();
    expect(queryByText("SUBHEADER")).toBeNull();
    expect(flat(getByTestId("keyboard-sheet-footer").props.style).paddingBottom).toBe(
      FOOTER_PADDING_KEYBOARD,
    );
    closeKeyboard();
    expect(queryByText("SUBHEADER")).toBeTruthy();
  });

  it("header and footer slots may be functions of the keyboard state", () => {
    const { queryByText } = renderSheet({
      header: ({ keyboardVisible }) => <Text>{keyboardVisible ? "H-TYPING" : "H-REST"}</Text>,
    });
    expect(queryByText("H-REST")).toBeTruthy();
    openKeyboard();
    expect(queryByText("H-TYPING")).toBeTruthy();
  });

  it("tapping the dimmed backdrop dismisses the keyboard and never closes the form", () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
    const onRequestClose = jest.fn();
    const { getByTestId } = renderSheet({ onRequestClose });
    fireEvent.press(getByTestId("keyboard-sheet-backdrop"));
    expect(dismiss).toHaveBeenCalled();
    expect(onRequestClose).not.toHaveBeenCalled();
    dismiss.mockRestore();
  });
});
