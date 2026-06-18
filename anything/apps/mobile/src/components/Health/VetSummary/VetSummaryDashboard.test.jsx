// Render pins for the rewired Vet Summary dashboard card (ticket 2.50): real 7-day counts
// (no hardcoded "24 logs"), and the "worth discussing" preview when flags exist.

import React from "react";
import { render } from "@testing-library/react-native";

let mockSummary;

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/utils/dateUtils", () => ({ getLocalPostDateString: () => "2026-06-18" }));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 1, name: "Rex" } }),
}));
jest.mock("@/hooks/useVetSummary", () => ({ useVetSummary: () => ({ data: mockSummary }) }));
// The modal is exercised by its own test; stub it here.
jest.mock("./VetSummaryModal", () => () => null);

import VetSummaryDashboard from "./VetSummaryDashboard";

test("shows real log counts, not the old hardcoded numbers", () => {
  mockSummary = {
    pet: { name: "Rex" },
    food: { count: 4 }, poo: { count: 2 }, pee: { count: 1 },
    vomit: { events: [] }, walks: { count: 0 }, wellness: { count: 0 },
    photoChecks: { count: 2 }, meds: [{ name: "X", given: 3, missed: 0, total: 3 }],
    weight: { series: [] },
  };
  const { getByTestId, queryByText } = render(<VetSummaryDashboard />);
  // 4+2+1 = 7 logs (the old fake card always said "24 logs")
  expect(getByTestId("dash-logs").props.children.join("")).toBe("📊 7 logs");
  expect(queryByText("📊 24 logs")).toBeNull();
});

test("surfaces a 'worth discussing' badge when flags exist", () => {
  mockSummary = {
    pet: { name: "Rex" },
    food: { count: 6, lowAppetiteCount: 0 }, poo: { count: 0, abnormalCount: 0 },
    pee: { count: 0, concernCount: 0 }, vomit: { episodes: 4, events: [{}, {}, {}, {}] },
    walks: { count: 0 }, wellness: { count: 0 }, photoChecks: { count: 0 }, meds: [],
    weight: { series: [] },
  };
  const { getByTestId } = render(<VetSummaryDashboard />);
  expect(getByTestId("dash-flags")).toBeTruthy();
});
