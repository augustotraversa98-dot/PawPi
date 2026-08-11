// Two-pane redesign: the booking rows (whose date-only formatting was the subject of this
// UTC-negative regression) MOVED from My Hub to the Services tab's "My Activity" pane. The
// regression itself now lives in components/Services/MyActivity.test.tz-negative.jsx. This
// file stays in the tz-negative process to guard that My Hub no longer renders a booking row
// at all — so no date-only column is parsed here anymore.
//
// Runs under the Buenos Aires-pinned process (jest.config.tz-negative.js). See the sibling
// MyActivity tz file for the actual date-shift assertion.

import React from "react";
import { render } from "@testing-library/react-native";

let mockGrants;
let mockFavorites;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/hooks/useProviders", () => ({
  useAdoptionFavorites: () => mockFavorites,
  useFollowedProviders: () => ({ data: [], isLoading: false }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k }),
}));
jest.mock("@/hooks/useCareAccessGrants", () => ({
  useAllCareAccessGrants: () => mockGrants,
}));

import MyHubScreen from "./hub";

function stub(data) {
  return { data, isLoading: false, isError: false, refetch: jest.fn() };
}

beforeEach(() => {
  mockGrants = stub([]);
  mockFavorites = stub([]);
});

it("sanity check: this process genuinely runs in the UTC-negative zone", () => {
  expect(new Date("2026-08-01").toLocaleDateString("en-US")).toBe("7/31/2026");
});

it("My Hub no longer renders the (moved) bookings section", () => {
  const { queryByText } = render(<MyHubScreen />);
  expect(queryByText("My bookings")).toBeNull();
  // The account-scoped sections that remain don't render any date-only column.
  expect(queryByText("Who has access")).toBeTruthy();
});
