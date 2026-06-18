// Render pins for Memories (ticket 2.49): on-this-day memories render from real history;
// a milestone card shows when one is hit; the Wrapped banner navigates; empty-safe.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockHistory;
let mockStreak;
let mockPush;

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: mockPush }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/Feed/MemoryShareButton", () => ({ MemoryShareButton: () => null }));
jest.mock("@/utils/dateUtils", () => ({ getLocalPostDateString: () => "2026-06-18" }));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 1, name: "Rex", birthday: "2020-06-18" } }),
}));
jest.mock("@/hooks/useMemories", () => ({ usePetHistory: () => mockHistory }));
jest.mock("@/hooks/useFeedPosts", () => ({ usePostingStreak: () => mockStreak }));

import MemoriesScreen from "./memories";

beforeEach(() => {
  mockPush = jest.fn();
  mockHistory = {
    data: [
      { id: 1, post_date: "2025-06-18", image_url: "a.png", caption: "park day" },
      { id: 2, post_date: "2025-06-17", image_url: "b.png" },
    ],
    isLoading: false,
  };
  mockStreak = { streak: 3 };
});

test("renders an on-this-day memory from a year ago", () => {
  const { getByTestId, getByText } = render(<MemoriesScreen />);
  expect(getByTestId("memory-1")).toBeTruthy();
  expect(getByText("1 year ago")).toBeTruthy();
});

test("shows a birthday milestone today", () => {
  const { getByTestId } = render(<MemoriesScreen />);
  expect(getByTestId("milestone-birthday")).toBeTruthy();
});

test("the Wrapped banner navigates to /wrapped", () => {
  const { getByTestId } = render(<MemoriesScreen />);
  fireEvent.press(getByTestId("open-wrapped"));
  expect(mockPush).toHaveBeenCalledWith("/wrapped");
});

test("empty history → no on-this-day memories, no crash", () => {
  mockHistory = { data: [], isLoading: false };
  const { queryByTestId, getByText } = render(<MemoriesScreen />);
  expect(queryByTestId("memory-1")).toBeNull();
  expect(getByText(/No memories from this day yet/)).toBeTruthy();
});
