// Render pins for the Pet Sitting discovery + visit-updates screen (ticket 2.9):
//   - a card renders per sitter from the (mocked) discovery hook — real data, no fakes;
//   - discovery is by the 'sitter' capability;
//   - the empty state shows when the list is [] (no fakes);
//   - tapping a card pushes the provider detail route with the slug AND capability='sitter'
//     (so the shared booking modal books a SITTING service, not a vet visit);
//   - the sitter's visit UPDATES surface (notes + media), owner-readable.
// The data hooks + router are mocked, so this exercises the screen wiring.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockDiscover;
let mockVisits;
let lastType;
const mockPush = jest.fn();

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
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
jest.mock("@/components/KeyboardAwareScrollView", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: ({ children }) => <View>{children}</View> };
});
jest.mock("@/components/DateField", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: () => <View /> };
});
jest.mock("@/components/Providers/RatingBadge", () => {
  const { View } = require("react-native");
  return { __esModule: true, default: () => <View /> };
});
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 5, name: "Rex" } }),
}));
jest.mock("@/hooks/useProviders", () => ({
  useDiscoverProviders: (type) => {
    lastType = type;
    return mockDiscover;
  },
  useSittingVisits: () => mockVisits,
  useBookProvider: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

import SittingScreen from "./sitting";

beforeEach(() => {
  mockPush.mockReset();
  lastType = undefined;
  mockVisits = { data: [] };
});

test("discovers providers by the sitter capability", () => {
  mockDiscover = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
  render(<SittingScreen />);
  expect(lastType).toBe("sitter");
});

test("renders a card per sitter from the discovery hook", () => {
  mockDiscover = {
    data: [
      { id: 1, slug: "cozy-sits", name: "Cozy Sits", bio: "In-home loving care" },
      { id: 2, slug: "home-pals", name: "Home Pals" },
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText } = render(<SittingScreen />);
  expect(getByText("Cozy Sits")).toBeTruthy();
  expect(getByText("Home Pals")).toBeTruthy();
  expect(getByText("In-home loving care")).toBeTruthy();
});

test("shows the empty state when no sitters exist (no fakes)", () => {
  mockDiscover = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
  const { getByText } = render(<SittingScreen />);
  expect(getByText("No sitters available yet")).toBeTruthy();
});

test("tapping a card navigates to the provider detail with slug + capability=sitter", () => {
  mockDiscover = {
    data: [{ id: 1, slug: "cozy-sits", name: "Cozy Sits" }],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText } = render(<SittingScreen />);

  fireEvent.press(getByText("Cozy Sits"));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/service/provider",
    params: { slug: "cozy-sits", capability: "sitter" },
  });
});

test("the sitter's visit updates surface for the owner to read", () => {
  mockDiscover = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
  mockVisits = {
    data: [
      {
        id: 9,
        status: "completed",
        provider_name: "Cozy Sits",
        notes: "Fed and walked, very happy",
        photo_urls: [],
        video_urls: [],
      },
    ],
  };
  const { getByText } = render(<SittingScreen />);
  expect(getByText("VISIT UPDATES")).toBeTruthy();
  expect(getByText("Cozy Sits")).toBeTruthy();
  expect(getByText("Fed and walked, very happy")).toBeTruthy();
});
