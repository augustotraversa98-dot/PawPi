// Anonymous tap telemetry on the shared PressableScale: a tap is emitted ONLY for a registry key
// (explicit `trackId`, or a testID / accessibilityLabel that IS a key), never for visible text, and the
// press behaviour itself is unchanged (mirrors the existing PressableScale tests in Button.test.jsx).

import React from "react";
import { Text } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { PressableScale } from "./PressableScale";
import { trackTap } from "@/telemetry/track";

jest.mock("@/telemetry/track", () => ({ trackTap: jest.fn() }));

beforeEach(() => {
  trackTap.mockClear();
});

describe("PressableScale tap telemetry", () => {
  it("emits a tap for an explicit trackId and still calls onPress once", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <PressableScale trackId="tab_health" onPress={onPress}>
        <Text>Health</Text>
      </PressableScale>,
    );
    fireEvent.press(getByText("Health"));
    expect(trackTap).toHaveBeenCalledTimes(1);
    expect(trackTap).toHaveBeenCalledWith("tab_health");
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("derives the key from a testID (lower-cased, - turned into _)", () => {
    const { getByText } = render(
      <PressableScale testID="Tab-Services" onPress={jest.fn()}>
        <Text>Services</Text>
      </PressableScale>,
    );
    fireEvent.press(getByText("Services"));
    expect(trackTap).toHaveBeenCalledWith("tab_services");
  });

  it("never emits visible text or an unregistered key, but onPress still runs", () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <PressableScale
        accessibilityLabel="Add my dog Luna"
        testID="delete-account"
        onPress={onPress}
      >
        <Text>Add my dog Luna</Text>
      </PressableScale>,
    );
    fireEvent.press(getByText("Add my dog Luna"));
    expect(trackTap).not.toHaveBeenCalled();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("an explicit trackId that is not a registry key is not emitted", () => {
    const { getByText } = render(
      <PressableScale trackId="Not A Key" onPress={jest.fn()}>
        <Text>Tap</Text>
      </PressableScale>,
    );
    fireEvent.press(getByText("Tap"));
    expect(trackTap).not.toHaveBeenCalled();
  });

  it("a trackable control without onPress does not throw", () => {
    const { getByText } = render(
      <PressableScale trackId="back">
        <Text>Back</Text>
      </PressableScale>,
    );
    expect(() => fireEvent.press(getByText("Back"))).not.toThrow();
    expect(trackTap).toHaveBeenCalledWith("back");
  });
});
