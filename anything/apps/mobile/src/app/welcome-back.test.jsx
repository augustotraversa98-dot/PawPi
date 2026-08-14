// Render pins for "Welcome back" (E12): the warm headline renders; a real friend moment + upcoming
// milestone show when present; the streak-repair CTA appears only when available and calls repair; the
// opt-out is present. i18n resolves against the real English catalog.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockData;
let mockRepair;
let mockOptOut;

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 7, name: "Rex" } }),
}));
jest.mock("@/hooks/useReengagement", () => ({
  useReengagement: () => mockData,
  useReengagementAction: () => ({ repair: mockRepair, optOut: mockOptOut, markSeen: jest.fn() }),
}));

import WelcomeBackScreen from "./welcome-back";

beforeEach(() => {
  mockRepair = jest.fn().mockResolvedValue({});
  mockOptOut = jest.fn().mockResolvedValue({});
  mockData = {
    isLoading: false,
    data: {
      lapsed: true,
      welcome_back: {
        friends: [{ pet_id: 2, name: "Bella", image_url: "b.png", post_date: "2026-08-12" }],
        milestone: { kind: "gotcha", in_days: 3 },
        streak: { current: 0 },
        repair_available: true,
      },
    },
  };
});

test("shows the warm headline, a friend moment, and the milestone", () => {
  const { getByText, getByTestId } = render(<WelcomeBackScreen />);
  expect(getByText("Rex is so happy you're here 🐾")).toBeTruthy();
  expect(getByTestId("wb-friend-2")).toBeTruthy();
  expect(getByTestId("welcome-back-milestone")).toBeTruthy();
});

test("repair CTA appears and calls repair", () => {
  const { getByTestId } = render(<WelcomeBackScreen />);
  fireEvent.press(getByTestId("welcome-back-repair"));
  expect(mockRepair).toHaveBeenCalled();
});

test("no repair CTA when not available; empty friends shows a clean empty line", () => {
  mockData = {
    isLoading: false,
    data: { lapsed: true, welcome_back: { friends: [], milestone: null, repair_available: false } },
  };
  const { queryByTestId, getByText } = render(<WelcomeBackScreen />);
  expect(queryByTestId("welcome-back-repair")).toBeNull();
  expect(getByText("When Rex's friends post, you'll see them here 🐾")).toBeTruthy();
});
