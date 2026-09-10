import React from "react";
import { render } from "@testing-library/react-native";

let mockOnline = true;
jest.mock("@/utils/connectivity", () => ({ useIsOnline: () => mockOnline }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());

import { OfflineBanner } from "./OfflineBanner";

test("renders nothing while online", () => {
  mockOnline = true;
  const { queryByTestId } = render(<OfflineBanner />);
  expect(queryByTestId("offline-banner")).toBeNull();
});

test("shows the offline strip while offline", () => {
  mockOnline = false;
  const { getByTestId, getByText } = render(<OfflineBanner />);
  expect(getByTestId("offline-banner")).toBeTruthy();
  expect(getByText("No internet connection — showing saved data")).toBeTruthy();
});
