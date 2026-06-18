// Render pins for the REAL Vet Summary modal (ticket 2.50): no mock data; renders the
// fetched summary + insight flags + disclaimer; range switch refetches; Share builds text.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Share } from "react-native";

let mockSummary;

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/utils/dateUtils", () => ({ getLocalPostDateString: () => "2026-06-18" }));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 1, name: "Rex" } }),
}));
const mockUseVetSummary = jest.fn();
jest.mock("@/hooks/useVetSummary", () => ({ useVetSummary: (...a) => mockUseVetSummary(...a) }));

import VetSummaryModal from "./VetSummaryModal";

beforeEach(() => {
  mockSummary = {
    pet: { name: "Rex" },
    range: { from: "2026-06-11", to: "2026-06-18" },
    food: { count: 6, lowAppetiteCount: 0, recent: [] },
    poo: { count: 5, abnormalCount: 0 },
    pee: { count: 4, concernCount: 0 },
    vomit: { episodes: 3, events: [{}, {}, {}] },
    weight: { series: [{ weight: 50, unit: "lbs" }, { weight: 46, unit: "lbs" }] },
    meds: [{ name: "Apoquel", dose: "16mg", given: 6, missed: 1, total: 7 }],
    photoChecks: { count: 4, byArea: {} },
    walks: { count: 3, totalMinutes: 90 },
    wellness: { count: 1 },
    conditions: [{ condition: "Arthritis", status: "active" }],
    allergies: [],
  };
  mockUseVetSummary.mockReturnValue({ data: mockSummary, isLoading: false, error: null });
});

test("renders real data with insight flags + disclaimer (no mock)", () => {
  const { getByText, getByTestId } = render(<VetSummaryModal visible onClose={jest.fn()} />);
  expect(getByTestId("vetsummary-recap")).toBeTruthy();
  // a weight-loss + vomiting + missed-med flag should surface
  expect(getByTestId("flag-weight-loss")).toBeTruthy();
  expect(getByTestId("flag-vomiting")).toBeTruthy();
  expect(getByText(/does not diagnose/)).toBeTruthy();
});

test("switching the range re-invokes the summary query with new dates", () => {
  const { getByTestId } = render(<VetSummaryModal visible onClose={jest.fn()} />);
  mockUseVetSummary.mockClear();
  fireEvent.press(getByTestId("range-30days"));
  // from = 2026-05-19 (30 days before 2026-06-18)
  expect(mockUseVetSummary).toHaveBeenCalledWith(1, "2026-05-19", "2026-06-18", true);
});

test("Share builds a text summary via the system share sheet", () => {
  const spy = jest.spyOn(Share, "share").mockResolvedValue({});
  const { getByTestId } = render(<VetSummaryModal visible onClose={jest.fn()} />);
  fireEvent.press(getByTestId("vetsummary-share"));
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy.mock.calls[0][0].message).toContain("PawPi Vet Summary — Rex");
  spy.mockRestore();
});

test("loading state shows a spinner, not fabricated data", () => {
  mockUseVetSummary.mockReturnValue({ data: null, isLoading: true, error: null });
  const { queryByTestId } = render(<VetSummaryModal visible onClose={jest.fn()} />);
  expect(queryByTestId("vetsummary-recap")).toBeNull();
});
