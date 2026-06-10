import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import TimeField from "./TimeField";
import { formatDisplayTime } from "../utils/canonicalDateTime";

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
    renderer = TestRenderer.create(<TimeField {...props} />);
  });
  return renderer;
};

describe("TimeField", () => {
  it("shows the placeholder when empty and no picker until tapped", () => {
    const r = render({ value: "", onChange: jest.fn(), testID: "t" });
    expect(fieldText(r)).toBe("Select time");
    expect(findPickers(r)).toHaveLength(0);
  });

  it("displays per the device 12/24h preference", () => {
    const r = render({ value: "20:00", onChange: jest.fn() });
    // Same preference detection the component uses; both forms accepted.
    expect(fieldText(r)).toBe(formatDisplayTime("20:00"));
    expect(["8:00 PM", "20:00"]).toContain(fieldText(r));
  });

  it("tolerates legacy HH:MM:SS values", () => {
    const r = render({ value: "20:00:00", onChange: jest.fn() });
    expect(fieldText(r)).toBe(formatDisplayTime("20:00"));
  });

  it("opens the spinner on the current value", () => {
    const r = render({ value: "20:30", onChange: jest.fn(), testID: "t" });
    press(r, "t");
    const [picker] = findPickers(r);
    expect(picker.props.mode).toBe("time");
    expect(picker.props.display).toBe("spinner");
    expect(picker.props.value.getHours()).toBe(20);
    expect(picker.props.value.getMinutes()).toBe(30);
  });

  it("commits a canonical default when opened empty (iOS has no confirm step)", () => {
    const onChange = jest.fn();
    const r = render({ value: "", onChange, testID: "t" });
    press(r, "t");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
  });

  it("emits canonical 24h HH:MM when a wheel settles", () => {
    const onChange = jest.fn();
    const r = render({ value: "20:30", onChange, testID: "t" });
    press(r, "t");
    act(() =>
      findPickers(r)[0].props.onChange(
        { type: "set" },
        new Date(2026, 0, 1, 8, 5),
      ),
    );
    expect(onChange).toHaveBeenCalledWith("08:05");
  });
});
