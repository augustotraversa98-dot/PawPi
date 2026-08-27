// Regression: a deep link with `?section=vet-record` must open the Vet-Record
// section directly (the Vet-Summary readiness card relies on this to reach the
// summary instead of a dead route). No param → the default "today" section.

import React from "react";
import { render } from "@testing-library/react-native";

let mockParams = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("@/components/Pets/PetSwitcher", () => ({ PetSwitcher: () => null }));
jest.mock("@/components/ui", () => {
  const { View } = require("react-native");
  return { GlassSurface: ({ children }) => <View>{children}</View>, PressableScale: ({ children }) => <View>{children}</View> };
});

const Stub = (label) => {
  const { Text } = require("react-native");
  return () => <Text>{label}</Text>;
};
jest.mock("../../components/Health/HealthToday", () => Stub("TODAY_SECTION"));
jest.mock("../../components/Health/HealthTrack", () => Stub("TRACK_SECTION"));
jest.mock("../../components/Health/HealthInsights", () => Stub("INSIGHTS_SECTION"));
jest.mock("../../components/Health/HealthVetRecord", () => Stub("VET_RECORD_SECTION"));

import HealthScreen from "./health";

beforeEach(() => {
  mockParams = {};
});

test("?section=vet-record opens the Vet Record section", () => {
  mockParams = { section: "vet-record" };
  const { getByText, queryByText } = render(<HealthScreen />);
  expect(getByText("VET_RECORD_SECTION")).toBeTruthy();
  expect(queryByText("TODAY_SECTION")).toBeNull();
});

test("no param defaults to the Today section", () => {
  const { getByText } = render(<HealthScreen />);
  expect(getByText("TODAY_SECTION")).toBeTruthy();
});

test("an unknown section param falls back to Today (never a blank screen)", () => {
  mockParams = { section: "bogus" };
  const { getByText } = render(<HealthScreen />);
  expect(getByText("TODAY_SECTION")).toBeTruthy();
});

// The Nutrition header button is intentionally hidden (feature not yet wired up).
// Its screen/route/hooks stay intact — only the entry point is gated off.
test("the Nutrition header button is not rendered", () => {
  const { queryByTestId, queryByText } = render(<HealthScreen />);
  expect(queryByTestId("nutrition-button")).toBeNull();
  expect(queryByText("Nutrition")).toBeNull();
});
