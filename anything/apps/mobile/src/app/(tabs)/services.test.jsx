// Render pins for the Pet Services hub category grid (bottom-nav entry):
//   - ALL catalog categories render as cards (Veterinary + Grooming + Dog Walking +
//     Daycare & Boarding live + coming-soon);
//   - the LIVE Veterinary / Grooming / Dog Walking / Daycare cards navigate to their
//     canonical discover/book flow;
//   - coming-soon cards are signposts: badged "Coming soon" and NOT tappable
//     (no navigation, no fake data behind them).
// The router is mocked, so this exercises the screen wiring.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import ServicesScreen from "./services";

const COMING_SOON = [
  "Training",
  "Shop",
  "Adoption",
];

beforeEach(() => {
  mockPush.mockReset();
});

test("renders the full category grid (Veterinary + every coming-soon category)", () => {
  const { getByText, getAllByText } = render(<ServicesScreen />);
  expect(getByText("Veterinary")).toBeTruthy();
  for (const title of COMING_SOON) {
    expect(getByText(title)).toBeTruthy();
  }
  // Every non-live category carries a visible "Coming soon" badge.
  expect(getAllByText("Coming soon")).toHaveLength(COMING_SOON.length);
});

test("tapping the live Veterinary card opens the vet discover/book flow", () => {
  const { getByText } = render(<ServicesScreen />);
  fireEvent.press(getByText("Veterinary"));
  expect(mockPush).toHaveBeenCalledWith("/(tabs)/more/vet");
});

test("tapping the live Grooming card opens the grooming discover/book flow", () => {
  const { getByText } = render(<ServicesScreen />);
  fireEvent.press(getByText("Grooming"));
  expect(mockPush).toHaveBeenCalledWith("/(tabs)/more/grooming");
});

test("tapping the live Dog Walking card opens the walking discover/live flow", () => {
  const { getByText } = render(<ServicesScreen />);
  fireEvent.press(getByText("Dog Walking"));
  expect(mockPush).toHaveBeenCalledWith("/(tabs)/more/walking");
});

test("tapping the live Daycare & Boarding card opens the daycare discover/book flow", () => {
  const { getByText } = render(<ServicesScreen />);
  fireEvent.press(getByText("Daycare & Boarding"));
  expect(mockPush).toHaveBeenCalledWith("/(tabs)/more/daycare");
});

test("tapping the live Pet Sitting card opens the sitting discover/book flow", () => {
  const { getByText } = render(<ServicesScreen />);
  fireEvent.press(getByText("Pet Sitting"));
  expect(mockPush).toHaveBeenCalledWith("/(tabs)/more/sitting");
});

test("coming-soon cards do NOT navigate into any flow", () => {
  const { getByText } = render(<ServicesScreen />);
  for (const title of COMING_SOON) {
    fireEvent.press(getByText(title));
  }
  expect(mockPush).not.toHaveBeenCalled();
});
