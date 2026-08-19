// In-app telehealth call screen: renders joinUrl inside a WebView (not an external browser),
// and the close affordance navigates back. WebView, router, and icons are mocked.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockParams;
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: mockCanGoBack }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-native-webview", () => {
  const { View } = require("react-native");
  return { WebView: (props) => <View testID="webview" {...props} /> };
});

import TelehealthCallScreen from "./telehealth-call";

beforeEach(() => {
  mockParams = { joinUrl: "https://pawpi.daily.co/room?t=abc" };
  mockBack.mockReset();
  mockReplace.mockReset();
  mockCanGoBack.mockReset().mockReturnValue(true);
});

test("renders the join URL inside a WebView", () => {
  const { getByTestId } = render(<TelehealthCallScreen />);
  expect(getByTestId("webview").props.source).toEqual({
    uri: "https://pawpi.daily.co/room?t=abc",
  });
});

test("the close affordance navigates back", () => {
  const { getByLabelText } = render(<TelehealthCallScreen />);
  fireEvent.press(getByLabelText("Leave call"));
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(mockReplace).not.toHaveBeenCalled();
});

test("with no navigation history, close falls back to the telehealth list", () => {
  mockCanGoBack.mockReturnValue(false);
  const { getByLabelText } = render(<TelehealthCallScreen />);
  fireEvent.press(getByLabelText("Leave call"));
  expect(mockReplace).toHaveBeenCalledWith("/service/telehealth");
});

test("no joinUrl → a clean message instead of an empty WebView", () => {
  mockParams = {};
  const { getByText, queryByTestId } = render(<TelehealthCallScreen />);
  expect(getByText("Couldn't load the video consult")).toBeTruthy();
  expect(queryByTestId("webview")).toBeNull();
});
