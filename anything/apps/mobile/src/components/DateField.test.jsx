import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import DateField from "./DateField";
import { toCanonicalDate, isValidDate } from "../utils/canonicalDateTime";

// Resolve t() against the real English catalog.
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());

jest.mock("@react-native-community/datetimepicker", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: (props) => React.createElement("DateTimePicker", props),
  };
});

jest.mock("lucide-react-native", () => ({
  Calendar: () => null,
  Clock: () => null,
}));

const findPickers = (renderer) =>
  renderer.root.findAll((n) => n.type === "DateTimePicker");

const press = (renderer, testID) => {
  const [node] = renderer.root.findAll(
    (n) => n.props.testID === testID && typeof n.props.onPress === "function",
  );
  act(() => node.props.onPress());
};

const fieldText = (renderer) =>
  renderer.root.findAllByType(Text)[0].props.children;

const render = (props) => {
  let renderer;
  act(() => {
    renderer = TestRenderer.create(<DateField {...props} />);
  });
  return renderer;
};

describe("DateField", () => {
  it("shows the placeholder when empty and no picker until tapped", () => {
    const r = render({ value: "", onChange: jest.fn(), testID: "f" });
    expect(fieldText(r)).toBe("Select date");
    expect(findPickers(r)).toHaveLength(0);
  });

  it('displays canonical values as "21 April 2025"', () => {
    const r = render({ value: "2025-04-21", onChange: jest.fn() });
    expect(fieldText(r)).toBe("21 April 2025");
  });

  it("displays legacy MM/DD/YYYY values the same way", () => {
    const r = render({ value: "04/21/2025", onChange: jest.fn() });
    expect(fieldText(r)).toBe("21 April 2025");
  });

  it("opens the calendar on the current value", () => {
    const r = render({ value: "2025-04-21", onChange: jest.fn(), testID: "f" });
    press(r, "f");
    const [picker] = findPickers(r);
    expect(picker.props.mode).toBe("date");
    expect(toCanonicalDate(picker.props.value)).toBe("2025-04-21");
  });

  it("opens on today when empty", () => {
    const r = render({ value: "", onChange: jest.fn(), testID: "f" });
    press(r, "f");
    const [picker] = findPickers(r);
    expect(toCanonicalDate(picker.props.value)).toBe(
      toCanonicalDate(new Date()),
    );
  });

  it("emits canonical YYYY-MM-DD on selection and closes", () => {
    const onChange = jest.fn();
    const r = render({ value: "", onChange, testID: "f" });
    press(r, "f");
    act(() =>
      findPickers(r)[0].props.onChange(
        { type: "set" },
        new Date(2025, 3, 21, 14, 5),
      ),
    );
    expect(onChange).toHaveBeenCalledWith("2025-04-21");
    expect(findPickers(r)).toHaveLength(0);
  });

  it("does not emit when the picker is dismissed", () => {
    const onChange = jest.fn();
    const r = render({ value: "2025-04-21", onChange, testID: "f" });
    press(r, "f");
    act(() =>
      findPickers(r)[0].props.onChange({ type: "dismissed" }, undefined),
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(findPickers(r)).toHaveLength(0);
  });

  describe("hardening (1969 bug)", () => {
    const BROKEN = [null, undefined, "", 0, NaN, new Date(NaN), "garbage", "1969-12-31", "1970-01-01"];

    it.each(BROKEN.map((v) => [String(v), v]))(
      "value %s shows the placeholder and opens the picker on today with a VALID Date",
      (_l, value) => {
        const r = render({ value, onChange: jest.fn(), testID: "f" });
        expect(fieldText(r)).toBe("Select date");
        press(r, "f");
        const [picker] = findPickers(r);
        expect(isValidDate(picker.props.value)).toBe(true);
        expect(toCanonicalDate(picker.props.value)).toBe(toCanonicalDate(new Date()));
      },
    );

    it("a future date is committed as the same calendar day (no 1969 jump)", () => {
      const onChange = jest.fn();
      const r = render({ value: "", onChange, testID: "f" });
      press(r, "f");
      act(() => findPickers(r)[0].props.onChange({ type: "set" }, new Date(2031, 11, 5, 23, 59)));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("2031-12-05");
    });

    it("30 Nov stays 30 Nov (day-edge times)", () => {
      const onChange = jest.fn();
      const r = render({ value: "", onChange, testID: "f" });
      press(r, "f");
      act(() => findPickers(r)[0].props.onChange({ type: "set" }, new Date(2026, 10, 30, 0, 0, 0)));
      expect(onChange).toHaveBeenLastCalledWith("2026-11-30");
    });

    it.each([
      ["undefined date", { type: "set" }, undefined],
      ["Invalid Date", { type: "set" }, new Date(NaN)],
      ["epoch timestamp 0", { type: "set" }, new Date(0)],
      ["dismissed with a date", { type: "dismissed" }, new Date(2031, 0, 1)],
    ])("ignores %s and keeps the previous value", (_l, event, selected) => {
      const onChange = jest.fn();
      const r = render({ value: "2026-12-01", onChange, testID: "f" });
      press(r, "f");
      act(() => findPickers(r)[0].props.onChange(event, selected));
      expect(onChange).not.toHaveBeenCalled();
      expect(fieldText(r)).toBe("1 December 2026");
    });

    it("survives repeated open / pick / dismiss cycles without throwing", () => {
      const onChange = jest.fn();
      const r = render({ value: "", onChange, testID: "f" });
      for (let i = 0; i < 5; i++) {
        press(r, "f");
        act(() => findPickers(r)[0].props.onChange({ type: "set" }, new Date(2031, 0, 1 + i)));
        press(r, "f");
        act(() => findPickers(r)[0].props.onChange({ type: "dismissed" }, undefined));
      }
      expect(onChange).toHaveBeenCalledTimes(5);
      expect(onChange).toHaveBeenLastCalledWith("2031-01-05");
    });

    it("hands the native picker valid, stable min/max bounds (a bare new Date() max is normalised)", () => {
      const r = render({
        value: "",
        onChange: jest.fn(),
        testID: "f",
        maximumDate: new Date(),
        minimumDate: new Date(NaN),
      });
      press(r, "f");
      const [picker] = findPickers(r);
      expect(isValidDate(picker.props.maximumDate)).toBe(true);
      expect(toCanonicalDate(picker.props.maximumDate)).toBe(toCanonicalDate(new Date()));
      expect(picker.props.minimumDate).toBeUndefined();
    });
  });
});
