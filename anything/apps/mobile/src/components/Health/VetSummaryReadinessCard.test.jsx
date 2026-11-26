// Regression: the "View Vet Summary" link must open the Health tab's Vet-Record
// section, NOT the dead `/(tabs)/more/vet` route (the service screens were moved
// out of the More stack in ticket 2.19, which left this push landing on a blank
// page). See fix/vet-summary-dead-page.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("@/components/ui/Card", () => {
  const { View } = require("react-native");
  return { Card: ({ children }) => <View>{children}</View> };
});

let mockReadiness;
let mockStats;
jest.mock("@/hooks/useHealthReinforcement", () => ({
  useVetSummaryReadiness: () => ({ data: mockReadiness }),
}));
jest.mock("@/hooks/useShareStats", () => ({
  useShareStats: () => ({ data: mockStats }),
}));

import { VetSummaryReadinessCard } from "./VetSummaryReadinessCard";

beforeEach(() => {
  mockPush.mockClear();
  mockReadiness = { filled: 2, total: 4, level: "building" };
  mockStats = { care_recap: { days_elapsed: 10, percent: 60 } };
});

test("View Vet Summary opens the Health vet-record section (not the dead more/vet route)", () => {
  const { getByText } = render(
    <VetSummaryReadinessCard petId={1} petName="Rex" />,
  );
  fireEvent.press(getByText(/View Vet Summary/));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/(tabs)/health",
    params: { section: "vet-record" },
  });
  // Never route to the removed More-stack screen.
  const target = mockPush.mock.calls[0][0];
  expect(JSON.stringify(target)).not.toContain("more/vet");
});

test("shows one headline, a labelled bar and the link, with no extra copy", () => {
  const { getByText, queryByText } = render(
    <VetSummaryReadinessCard petId={1} petName="Rex" />,
  );
  expect(getByText(/Rex's care was 60% this month/)).toBeTruthy();
  expect(getByText("Vet summary: 2 of 4 areas started")).toBeTruthy();
  expect(queryByText(/is building|the more you log|vetReadiness\./)).toBeNull();
});

test("a month with no care yet keeps the care story headline", () => {
  mockStats = { care_recap: { days_elapsed: 10, percent: 0 } };
  const { getByText } = render(
    <VetSummaryReadinessCard petId={1} petName="Rex" />,
  );
  expect(getByText(/Let's build Rex's care story this month/)).toBeTruthy();
});

test("renders cleanly with empty readiness/stats (no crash, still links)", () => {
  mockReadiness = undefined;
  mockStats = undefined;
  const { getByText } = render(
    <VetSummaryReadinessCard petId={1} petName="Rex" />,
  );
  fireEvent.press(getByText(/View Vet Summary/));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/(tabs)/health",
    params: { section: "vet-record" },
  });
});
