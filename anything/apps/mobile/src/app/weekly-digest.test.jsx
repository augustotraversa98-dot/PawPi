// Render pins for "Rex's Week" (E11): real stats render as the true numbers; a quiet/empty week
// degrades to the honest headline (no fabricated numbers); friends strip + milestone render when
// present; toggling a channel PUTs the pref. i18n resolves against the real English catalog.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockDigest;
let mockPrefs;
let mockMutate;

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("@/components/Feed/MemoryShareButton", () => ({ MemoryShareButton: () => null }));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 7, name: "Rex" } }),
}));
jest.mock("@/hooks/useWeeklyDigest", () => ({
  useWeeklyDigest: () => mockDigest,
  useWeeklyDigestPrefs: () => mockPrefs,
  useUpdateWeeklyDigestPrefs: () => ({ mutate: mockMutate }),
}));

import WeeklyDigestScreen from "./weekly-digest";

beforeEach(() => {
  mockMutate = jest.fn();
  mockPrefs = { data: { push_enabled: true, email_enabled: false } };
  mockDigest = {
    isLoading: false,
    data: {
      state: "rich",
      walks: 5,
      ring_days_closed: 4,
      ring_days_total: 7,
      care_actions: 6,
      moments: 3,
      streak: { current: 12, longest: 20 },
      best_moment: { post_id: 9, image_url: "a.png", caption: "park day", paws: 4 },
      friends: [{ pet_id: 2, name: "Bella", avatar_url: "b.png" }],
      milestone: { kind: "birthday", in_days: 3 },
    },
  };
});

test("a rich week renders the real numbers", () => {
  const { getByTestId, getByText } = render(<WeeklyDigestScreen />);
  expect(getByText("What a week, Rex! 🐾")).toBeTruthy();
  expect(getByTestId("tile-walks-value")).toHaveTextContent("5");
  expect(getByTestId("tile-ring-value")).toHaveTextContent("4/7");
  expect(getByTestId("tile-streak-value")).toHaveTextContent("12");
  expect(getByTestId("best-moment")).toBeTruthy();
  expect(getByTestId("friend-2")).toBeTruthy();
  expect(getByTestId("milestone-preview")).toBeTruthy();
});

test("an empty week shows the honest headline and zeroed tiles (no fake numbers)", () => {
  mockDigest = {
    isLoading: false,
    data: {
      state: "empty", walks: 0, ring_days_closed: 0, ring_days_total: 7,
      care_actions: 0, moments: 0, streak: null, best_moment: null, friends: [], milestone: null,
    },
  };
  const { getByTestId, getByText, queryByTestId } = render(<WeeklyDigestScreen />);
  expect(getByText("A fresh week is waiting for Rex 🐾")).toBeTruthy();
  expect(getByTestId("tile-walks-value")).toHaveTextContent("0");
  expect(queryByTestId("best-moment")).toBeNull();
  expect(queryByTestId("friends-strip")).toBeNull();
});

test("toggling email PUTs the pref", () => {
  const { getByTestId } = render(<WeeklyDigestScreen />);
  fireEvent(getByTestId("pref-email"), "valueChange", true);
  expect(mockMutate).toHaveBeenCalledWith({ email_enabled: true });
});
