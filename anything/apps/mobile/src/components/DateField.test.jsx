import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import DateField from "./DateField";
import { toCanonicalDate } from "../utils/canonicalDateTime";

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
});
