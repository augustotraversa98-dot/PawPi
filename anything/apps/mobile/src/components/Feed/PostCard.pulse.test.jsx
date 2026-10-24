// Only the first LOCKED_PULSE_CARDS locked cards run the infinite attention pulse (perf audit 5.5, partial).
import React from "react";
import { render } from "@testing-library/react-native";

const mockMoti = jest.fn();
jest.mock("moti", () => {
  const { View } = require("react-native");
  return {
    MotiView: (props) => {
      mockMoti(props);
      return <View>{props.children}</View>;
    },
  };
});
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("@/hooks/useFeedPosts", () => ({
  useTogglePaw: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock("@/hooks/useAccessibilityPrefs", () => ({
  useReduceTransparency: () => false,
  useReducedMotion: () => false,
}));
jest.mock("expo-av", () => {
  const { View } = require("react-native");
  return { __esModule: true, Video: () => <View />, ResizeMode: { COVER: "cover" } };
});

import { PostCard } from "./PostCard";

const post = { id: 1, pet_name: "Rex", image_url: "https://x/p.jpg" };
const loopFor = (index) => {
  mockMoti.mockClear();
  render(<PostCard post={post} liked={false} locked lockedCtaIndex={index} />);
  return mockMoti.mock.calls[0][0].transition.loop;
};

test("the first three locked cards pulse; later ones do not", () => {
  expect(loopFor(0)).toBe(true);
  expect(loopFor(2)).toBe(true);
  expect(loopFor(3)).toBe(false);
  expect(loopFor(11)).toBe(false);
});
