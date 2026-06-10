import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import DayChips, { DAY_CHIP_LABELS } from "./DayChips";

const render = (props) => {
  let renderer;
  act(() => {
    renderer = TestRenderer.create(<DayChips {...props} />);
  });
  return renderer;
};

const press = (renderer, day) => {
  const [chip] = renderer.root.findAll(
    (n) =>
      n.props.testID === `day-chips-${day}` &&
      typeof n.props.onPress === "function",
  );
  act(() => chip.props.onPress());
};

describe("DayChips", () => {
  it("renders Mon–Sun in the Monday=0 convention shared with the generator", () => {
    expect(DAY_CHIP_LABELS).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);

    const r = render({ value: [], onChange: jest.fn() });
    const labels = r.root.findAllByType(Text).map((n) => n.props.children);
    expect(labels).toEqual(DAY_CHIP_LABELS);
  });

  it("multi-select adds days and emits a sorted integer array", () => {
    const onChange = jest.fn();
    const r = render({ value: [4], onChange });

    press(r, 1);
    expect(onChange).toHaveBeenCalledWith([1, 4]);
  });

  it("multi-select removes an already-selected day", () => {
    const onChange = jest.fn();
    const r = render({ value: [1, 4], onChange });

    press(r, 4);
    expect(onChange).toHaveBeenCalledWith([1]);
  });

  it("multiSelect={false} replaces the selection with the tapped day", () => {
    const onChange = jest.fn();
    const r = render({ value: [6], onChange, multiSelect: false });

    press(r, 2);
    expect(onChange).toHaveBeenCalledWith([2]);
  });
});
