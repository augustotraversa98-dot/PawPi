// Negative-UTC-offset regression for My Hub's booking rows (see hub.test.jsx for the main
// wiring suite). appointment_date is a Postgres `date`-only column (no time component); the old
// local formatDate() parsed it via `new Date(dateOnlyString)`, which JS treats as UTC midnight —
// for a device behind UTC (e.g. Buenos Aires, UTC-3) that renders one calendar day EARLY than
// what was actually booked. hub.jsx now formats appointment_date via canonicalDateTime's
// formatDisplayDate(), which parses the Y/M/D digits directly and never crosses a UTC boundary.
//
// This file runs under its own Jest process (`npm run test:tz-negative`, jest.config.tz-
// negative.js + jest.tz.negative.setup.js) pinned to America/Argentina/Buenos_Aires, because the
// main suite is pinned to Europe/Rome (UTC-positive, jest.tz.setup.js) where this bug never
// reproduces, and a mid-suite process.env.TZ override is a silent no-op once a Jest worker has
// already used Date (V8 caches the zone on first use) — see jest.tz.negative.setup.js.

import React from "react";
import { render } from "@testing-library/react-native";

let mockBookings;
let mockOrders;
let mockSubs;
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
  useMyBookings: () => mockBookings,
  useShopOrders: () => mockOrders,
  useShopSubscriptions: () => mockSubs,
  useAdoptionFavorites: () => mockFavorites,
}));
jest.mock("@/hooks/useCareAccessGrants", () => ({
  useAllCareAccessGrants: () => mockGrants,
}));

import MyHubScreen from "./hub";

function stub(data) {
  return { data, isLoading: false, isError: false, refetch: jest.fn() };
}

beforeEach(() => {
  mockBookings = stub({ upcoming: [], past: [] });
  mockOrders = stub([]);
  mockSubs = stub([]);
  mockGrants = stub([]);
  mockFavorites = stub([]);
});

it("sanity check: this process genuinely reproduces the UTC-negative bug precondition", () => {
  // Confirms the pinned TZ actually took effect — the old, buggy `new Date(dateOnlyString)`
  // parse shifts the displayed day back one in this zone. If this assertion ever fails, the
  // test below is not exercising the regression it claims to.
  expect(new Date("2026-08-01").toLocaleDateString("en-US")).toBe("7/31/2026");
});

it("renders a date-only appointment_date on its own calendar day, not shifted back a day", () => {
  mockBookings = stub({
    upcoming: [
      {
        id: 1,
        provider_name: "Vet A",
        pet_name: "Rex",
        service_name: "Checkup",
        appointment_date: "2026-08-01",
        booking_status: "confirmed",
      },
    ],
    past: [],
  });

  const { getByText, queryByText } = render(<MyHubScreen />);
  expect(getByText(/1 August 2026/)).toBeTruthy();
  expect(queryByText(/31 July 2026/)).toBeNull();
});
