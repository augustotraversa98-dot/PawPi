// Button + PressableScale render/behavior tests (ticket 2.77).
// The spring is device-judged; here we only prove the primitives stay functional
// after the restyle — they render, fire onPress, and respect disabled.

import React from "react";
import { Text } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { Button } from "./Button";
import { PressableScale } from "./PressableScale";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));

describe("Button", () => {
  it("renders its title and fires onPress", () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button title="Save" onPress={onPress} />);
    fireEvent.press(getByText("Save"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not fire onPress when disabled", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Button title="Save" onPress={onPress} disabled />,
    );
    fireEvent.press(getByText("Save"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("shows a spinner (and hides the label) while loading", () => {
    const { queryByText } = render(<Button title="Save" loading />);
    expect(queryByText("Save")).toBeNull();
  });

  it("renders custom children instead of a title when provided", () => {
    const { getByText } = render(
      <Button onPress={jest.fn()}>
        <Text>Custom</Text>
      </Button>,
    );
    expect(getByText("Custom")).toBeTruthy();
  });
});

describe("PressableScale", () => {
  it("forwards onPress", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <PressableScale onPress={onPress}>
        <Text>Tap</Text>
      </PressableScale>,
    );
    fireEvent.press(getByText("Tap"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("runs its press-in/press-out springs without throwing", () => {
    const { getByText } = render(
      <PressableScale onPress={jest.fn()}>
        <Text>Tap</Text>
      </PressableScale>,
    );
    const node = getByText("Tap");
    fireEvent(node, "pressIn");
    fireEvent(node, "pressOut");
    expect(node).toBeTruthy();
  });
});
