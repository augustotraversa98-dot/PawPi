// Render pins for Wrapped (ticket 2.49): enough data → stat slides render + are shareable;
// thin data → the empty-safe "growing" state (no fabricated stats).

import React from "react";
import { render } from "@testing-library/react-native";

let mockHistory;

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
let shareCount = 0;
jest.mock("@/components/Feed/MemoryShareButton", () => ({
  MemoryShareButton: () => {
    shareCount += 1;
    return null;
  },
}));
jest.mock("@/utils/dateUtils", () => ({ getLocalPostDateString: () => "2026-12-31" }));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 1, name: "Rex" } }),
}));
jest.mock("@/hooks/useMemories", () => ({ usePetHistory: () => mockHistory }));

import WrappedScreen from "./wrapped";

beforeEach(() => {
  shareCount = 0;
});

test("enough data → stat slides render and are shareable", () => {
  const dates = Array.from({ length: 15 }, (_, i) => `2026-04-${String(i + 1).padStart(2, "0")}`);
  mockHistory = { data: dates.map((d, i) => ({ id: i, post_date: d, image_url: "x" })), isLoading: false };
  const { getByTestId } = render(<WrappedScreen />);
  expect(getByTestId("slide-intro")).toBeTruthy();
  expect(getByTestId("slide-posts")).toBeTruthy();
  expect(getByTestId("slide-streak")).toBeTruthy();
  expect(shareCount).toBeGreaterThan(0); // each slide is shareable
});

test("thin data → empty-safe growing state, no fabricated stats", () => {
  mockHistory = { data: [{ id: 1, post_date: "2026-01-01", image_url: "x" }], isLoading: false };
  const { getByTestId, queryByTestId } = render(<WrappedScreen />);
  expect(getByTestId("wrapped-empty")).toBeTruthy();
  expect(queryByTestId("slide-intro")).toBeNull();
});
