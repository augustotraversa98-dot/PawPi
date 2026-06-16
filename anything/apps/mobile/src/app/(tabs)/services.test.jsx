// Render pins for the promoted Pet Services hub (bottom-nav entry):
//   - the LIVE Veterinary service renders and links to the vet discover/book flow;
//   - NO not-yet-live types (walker / daycare / groomer / shop / adoption) are
//     surfaced — only built types appear, no mock "coming soon" rows.
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

beforeEach(() => {
  mockPush.mockReset();
});

test("features the live Veterinary service", () => {
  const { getByText } = render(<ServicesScreen />);
  expect(getByText("Veterinary")).toBeTruthy();
});

test("tapping Veterinary opens the vet discover/book flow", () => {
  const { getByText } = render(<ServicesScreen />);
  fireEvent.press(getByText("Veterinary"));
  expect(mockPush).toHaveBeenCalledWith("/(tabs)/more/vet");
});

test("does NOT surface not-yet-live service types (no mock rows)", () => {
  const { queryByText } = render(<ServicesScreen />);
  for (const notLive of [
    "Walker",
    "Daycare",
    "Boarding",
    "Groomer",
    "Pet Shop",
    "Adoption",
  ]) {
    expect(queryByText(notLive)).toBeNull();
  }
});
