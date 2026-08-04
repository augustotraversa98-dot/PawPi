// Negative-UTC-offset regression for MyActivity's booking rows (moved here from My Hub in the
// two-pane redesign). appointment_date is a Postgres `date`-only column (no time component);
// the old `new Date(dateOnlyString)` parse treats it as UTC midnight, so on a device behind
// UTC (Buenos Aires, UTC-3) it renders one calendar day EARLY. MyActivity formats it via
// canonicalDateTime's formatDisplayDate(), which parses the Y/M/D digits directly and never
// crosses a UTC boundary.
//
// Runs under its own Buenos Aires-pinned Jest process (jest.config.tz-negative.js); the main
// suite is pinned to Europe/Rome (UTC-positive) where this bug never reproduces.

import React from "react";
import { render, waitFor } from "@testing-library/react-native";

let mockMyBookings;
const mockEmpty = { data: [], isLoading: false, refetch: jest.fn() };

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/hooks/useProviders", () => ({
  useMyBookings: () => mockMyBookings,
  useUnreadCount: () => ({ data: 0 }),
  useWalkSessions: () => mockEmpty,
  useDaycareStays: () => mockEmpty,
  useSittingVisits: () => mockEmpty,
  useShopOrders: () => mockEmpty,
  useShopSubscriptions: () => mockEmpty,
}));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 1 } }),
}));

import MyActivity from "./MyActivity";

function stub(data) {
  return { data, isLoading: false, refetch: jest.fn() };
}

beforeEach(() => {
  mockMyBookings = stub({ upcoming: [], past: [] });
});

it("sanity check: this process genuinely reproduces the UTC-negative precondition", () => {
  expect(new Date("2026-08-01").toLocaleDateString("en-US")).toBe("7/31/2026");
});

it("renders a date-only appointment_date on its own calendar day, not shifted back a day", async () => {
  mockMyBookings = stub({
    upcoming: [
      {
        id: 1,
        provider_name: "Vet A",
        pet_name: "Rex",
        service_name: "Checkup",
        appointment_date: "2026-08-01",
        provider_slug: "vet-a",
        capability: "vet",
      },
    ],
    past: [],
  });

  const { getByText, queryByText } = render(<MyActivity />);
  await waitFor(() => expect(getByText(/1 August 2026/)).toBeTruthy());
  expect(queryByText(/31 July 2026/)).toBeNull();
});
