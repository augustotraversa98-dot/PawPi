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

// Every catalog category is now LIVE (ticket 2.12 flips Adoption live — the last card).
const COMING_SOON = [];

beforeEach(() => {
  mockPush.mockReset();
});

test("renders the full category grid (every category live, none coming-soon)", () => {
  const { getByText, queryAllByText } = render(<ServicesScreen />);
  expect(getByText("Veterinary")).toBeTruthy();
  expect(getByText("Adoption")).toBeTruthy();
  // No category carries a "Coming soon" badge anymore — all flows are live.
  expect(queryAllByText("Coming soon")).toHaveLength(COMING_SOON.length);
});

test("tapping the live Veterinary card opens the vet discover/book flow", () => {
  const { getByText } = render(<ServicesScreen />);
  fireEvent.press(getByText("Veterinary"));
  expect(mockPush).toHaveBeenCalledWith("/service/vet");
});

test("tapping the live Grooming card opens the grooming discover/book flow", () => {
  const { getByText } = render(<ServicesScreen />);
  fireEvent.press(getByText("Grooming"));
  expect(mockPush).toHaveBeenCalledWith("/service/grooming");
});

test("tapping the live Telehealth card opens the telehealth discover/consult flow", () => {
  const { getByText } = render(<ServicesScreen />);
  fireEvent.press(getByText("Telehealth"));
  expect(mockPush).toHaveBeenCalledWith("/service/telehealth");
});

// Regression guard for the More-tab corruption (ticket 2.19): NO Services card may push
// into the (tabs)/more/ stack. They must all open the root-level `service/` stack, which
// presents over the tabs and never buries the More tab root.
test("no Services card routes into the More tab stack (2.19 regression)", () => {
  const { getByText } = render(<ServicesScreen />);
  for (const title of [
    "Veterinary",
    "Telehealth",
    "Grooming",
    "Dog Walking",
    "Daycare & Boarding",
    "Pet Sitting",
    "Training",
    "Shop",
    "Adoption",
  ]) {
    fireEvent.press(getByText(title));
  }
  for (const call of mockPush.mock.calls) {
    const target = typeof call[0] === "string" ? call[0] : call[0]?.pathname;
    expect(String(target)).not.toContain("/(tabs)/more/");
    expect(String(target).startsWith("/service/")).toBe(true);
  }
});

test("tapping the live Dog Walking card opens the walking discover/live flow", () => {
  const { getByText } = render(<ServicesScreen />);
  fireEvent.press(getByText("Dog Walking"));
  expect(mockPush).toHaveBeenCalledWith("/service/walking");
});

test("tapping the live Daycare & Boarding card opens the daycare discover/book flow", () => {
  const { getByText } = render(<ServicesScreen />);
  fireEvent.press(getByText("Daycare & Boarding"));
  expect(mockPush).toHaveBeenCalledWith("/service/daycare");
});

test("tapping the live Pet Sitting card opens the sitting discover/book flow", () => {
  const { getByText } = render(<ServicesScreen />);
  fireEvent.press(getByText("Pet Sitting"));
  expect(mockPush).toHaveBeenCalledWith("/service/sitting");
});

test("tapping the live Training card opens the PROVIDER training service (not the self tab)", () => {
  const { getByText } = render(<ServicesScreen />);
  fireEvent.press(getByText("Training"));
  expect(mockPush).toHaveBeenCalledWith("/service/training");
});

test("tapping the live Shop card opens the shop discover/catalog flow", () => {
  const { getByText } = render(<ServicesScreen />);
  fireEvent.press(getByText("Shop"));
  expect(mockPush).toHaveBeenCalledWith("/service/shop");
});

test("tapping the live Adoption card opens the adoption discover flow", () => {
  const { getByText } = render(<ServicesScreen />);
  fireEvent.press(getByText("Adoption"));
  expect(mockPush).toHaveBeenCalledWith("/service/adoption");
});

test("coming-soon cards do NOT navigate into any flow", () => {
  const { getByText } = render(<ServicesScreen />);
  for (const title of COMING_SOON) {
    fireEvent.press(getByText(title));
  }
  expect(mockPush).not.toHaveBeenCalled();
});
