// GettingStartedCard (ticket 2.98) — the activation card. The composite hook is mocked so these
// tests drive the card's rendering/branching directly (derivations + % math are covered in
// utils/gettingStarted.test.js).
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockState;
const mockPush = jest.fn();
const mockEnable = jest.fn();
const mockMarkCelebrated = jest.fn();

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("@/hooks/useGettingStarted", () => ({
  useGettingStarted: () => mockState,
}));

import { GettingStartedCard } from "./GettingStartedCard";
import { computeActivation } from "@/utils/gettingStarted";

const fullPet = {
  name: "Mango",
  breed: "Beagle",
  gender: "male",
  weight: 12,
  birthday: "2022-01-01",
};

function stateWith(overrides = {}) {
  return {
    pet: { id: 1, name: "Mango" },
    activation: computeActivation({ pet: { name: "Mango", breed: "Beagle" } }), // 1/6
    enableNotifications: mockEnable,
    celebrated: false,
    markCelebrated: mockMarkCelebrated,
    ...overrides,
  };
}

beforeEach(() => {
  mockPush.mockClear();
  mockEnable.mockClear();
  mockMarkCelebrated.mockClear();
  mockState = stateWith();
});

test("renders the card with a percent badge and all six checklist rows", () => {
  const { getByTestId } = render(<GettingStartedCard />);
  expect(getByTestId("getting-started-card")).toBeTruthy();
  for (const key of ["basics", "history", "reminder", "meal", "post", "notifications"]) {
    expect(getByTestId(`gs-item-${key}`)).toBeTruthy();
  }
  // basics done (name+breed) → its check is the done variant; meal not.
  expect(getByTestId("gs-check-basics-done")).toBeTruthy();
  expect(getByTestId("gs-check-meal")).toBeTruthy();
});

test("no active pet → renders nothing", () => {
  mockState = stateWith({ pet: null });
  const { queryByTestId } = render(<GettingStartedCard />);
  expect(queryByTestId("getting-started-card")).toBeNull();
});

test("tapping items routes / enables / shares appropriately", () => {
  const onSharePost = jest.fn();
  const { getByTestId } = render(<GettingStartedCard onSharePost={onSharePost} />);

  fireEvent.press(getByTestId("gs-item-basics"));
  expect(mockPush).toHaveBeenCalledWith("/more/profile-edit");

  fireEvent.press(getByTestId("gs-item-reminder"));
  expect(mockPush).toHaveBeenCalledWith("/(tabs)/more/reminders");

  fireEvent.press(getByTestId("gs-item-meal"));
  expect(mockPush).toHaveBeenCalledWith("/(tabs)/health");

  fireEvent.press(getByTestId("gs-item-post"));
  expect(onSharePost).toHaveBeenCalled();

  fireEvent.press(getByTestId("gs-item-notifications"));
  expect(mockEnable).toHaveBeenCalled();
});

test("at 100% (not yet celebrated) it shows the celebration, not the checklist", () => {
  mockState = stateWith({
    pet: fullPet,
    activation: computeActivation({
      pet: fullPet,
      hasReminder: true,
      hasMeal: true,
      hasPost: true,
      notificationsGranted: true,
    }),
    celebrated: false,
  });
  const { getByTestId, queryByTestId } = render(<GettingStartedCard />);
  expect(getByTestId("getting-started-celebration")).toBeTruthy();
  expect(queryByTestId("getting-started-card")).toBeNull();
});

test("at 100% AND already celebrated → the card is retired (renders nothing)", () => {
  mockState = stateWith({
    pet: fullPet,
    activation: computeActivation({
      pet: fullPet,
      hasReminder: true,
      hasMeal: true,
      hasPost: true,
      notificationsGranted: true,
    }),
    celebrated: true,
  });
  const { queryByTestId } = render(<GettingStartedCard />);
  expect(queryByTestId("getting-started-celebration")).toBeNull();
  expect(queryByTestId("getting-started-card")).toBeNull();
});
