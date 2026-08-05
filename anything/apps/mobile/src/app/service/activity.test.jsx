// /service/activity is now a THIN WRAPPER: a back header + the shared <MyActivity/> pane, so
// the existing deep-link keeps working. MyActivity's own suite (components/Services/
// MyActivity.test.jsx) covers the sections; here we only assert the wrapper chrome.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));
jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/Services/MyActivity", () => {
  const { View } = require("react-native");
  return () => <View testID="my-activity-pane" />;
});

import ActivityScreen from "./activity";

beforeEach(() => {
  mockBack.mockReset();
});

test("renders the back header (title) and the MyActivity pane", () => {
  const { getByText, getByTestId } = render(<ActivityScreen />);
  expect(getByText("Activity")).toBeTruthy(); // t("activity.title")
  expect(getByTestId("my-activity-pane")).toBeTruthy();
});

test("the back control invokes router.back()", () => {
  const { getByLabelText } = render(<ActivityScreen />);
  fireEvent.press(getByLabelText("Back")); // t("common.back")
  expect(mockBack).toHaveBeenCalled();
});
