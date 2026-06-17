// Render pins for the Grooming discovery screen (ticket 2.6):
//   - a card renders per groomer from the (mocked) discovery hook — real data, no
//     mocks baked into the screen;
//   - the empty state shows when the list is [] (no fakes);
//   - tapping a card pushes the provider detail route with the slug AND
//     capability='groomer' (so the shared booking modal books a GROOM, not a vet visit).
// The data hook + router are mocked, so this exercises the screen wiring.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockDiscover;
let lastType;
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
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/hooks/useProviders", () => ({
  useDiscoverProviders: (type) => {
    lastType = type;
    return mockDiscover;
  },
}));

import GroomingScreen from "./grooming";

beforeEach(() => {
  mockPush.mockReset();
  lastType = undefined;
});

test("discovers providers by the groomer capability", () => {
  mockDiscover = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
  render(<GroomingScreen />);
  expect(lastType).toBe("groomer");
});

test("renders a card per groomer from the discovery hook", () => {
  mockDiscover = {
    data: [
      { id: 1, slug: "pet-spa", name: "Pet Spa", bio: "Full grooms & baths" },
      { id: 2, slug: "fluff", name: "Fluff & Buff" },
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText } = render(<GroomingScreen />);
  expect(getByText("Pet Spa")).toBeTruthy();
  expect(getByText("Fluff & Buff")).toBeTruthy();
  expect(getByText("Full grooms & baths")).toBeTruthy();
});

test("shows the empty state when no groomers exist (no fakes)", () => {
  mockDiscover = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
  const { getByText } = render(<GroomingScreen />);
  expect(getByText("No groomers available yet")).toBeTruthy();
});

test("tapping a card navigates to the provider detail with slug + capability=groomer", () => {
  mockDiscover = {
    data: [{ id: 1, slug: "pet-spa", name: "Pet Spa" }],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText } = render(<GroomingScreen />);

  fireEvent.press(getByText("Pet Spa"));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/(tabs)/more/provider",
    params: { slug: "pet-spa", capability: "groomer" },
  });
});
