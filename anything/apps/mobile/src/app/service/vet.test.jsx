// Render pins for the Veterinary discovery screen:
//   - a card renders per provider from the (mocked) discovery hook — real data,
//     no mocks baked into the screen;
//   - the empty state shows when the list is [];
//   - tapping a card pushes the provider detail route with that provider's slug.
// The data hook + router are mocked, so this exercises the screen wiring.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockDiscover;
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
  useDiscoverProviders: () => mockDiscover,
}));

import VetScreen from "./vet";

beforeEach(() => {
  mockPush.mockReset();
});

test("renders a card per provider from the discovery hook", () => {
  mockDiscover = {
    data: [
      { id: 1, slug: "happy-paws", name: "Happy Paws Clinic", provider_type: "vet", bio: "Friendly vets" },
      { id: 2, slug: "city-vet", name: "City Vet", provider_type: "vet", bio: "Downtown care" },
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText } = render(<VetScreen />);
  expect(getByText("Happy Paws Clinic")).toBeTruthy();
  expect(getByText("City Vet")).toBeTruthy();
  expect(getByText("Friendly vets")).toBeTruthy();
});

test("shows the empty state when no providers exist (no fakes)", () => {
  mockDiscover = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
  const { getByText } = render(<VetScreen />);
  expect(getByText("No vets available yet")).toBeTruthy();
});

test("typing in the search box filters the list by name (type-ahead)", () => {
  mockDiscover = {
    data: [
      { id: 1, slug: "happy-paws", name: "Happy Paws Clinic", provider_type: "vet" },
      { id: 2, slug: "city-vet", name: "City Vet", provider_type: "vet" },
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByPlaceholderText, getByText, queryByText } = render(<VetScreen />);
  fireEvent.changeText(getByPlaceholderText("Search vets by name"), "city");
  expect(getByText("City Vet")).toBeTruthy();
  expect(queryByText("Happy Paws Clinic")).toBeNull();
});

test("a search with no matches shows a 'no matching vets' state", () => {
  mockDiscover = {
    data: [
      { id: 1, slug: "happy-paws", name: "Happy Paws Clinic", provider_type: "vet" },
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByPlaceholderText, getByText } = render(<VetScreen />);
  fireEvent.changeText(getByPlaceholderText("Search vets by name"), "zzz");
  expect(getByText("No matching vets")).toBeTruthy();
});

test("Top rated sort orders providers by average rating", () => {
  mockDiscover = {
    data: [
      { id: 1, slug: "low", name: "Low Rated", provider_type: "vet", avg_rating: 3.1 },
      { id: 2, slug: "high", name: "High Rated", provider_type: "vet", avg_rating: 4.9 },
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText, UNSAFE_getAllByType } = render(<VetScreen />);
  fireEvent.press(getByText("Top rated"));
  const { Text } = require("react-native");
  const names = UNSAFE_getAllByType(Text)
    .map((n) => (typeof n.props.children === "string" ? n.props.children : null))
    .filter((t) => t === "High Rated" || t === "Low Rated");
  expect(names[0]).toBe("High Rated");
});

test("tapping a card navigates to the provider detail with the slug", () => {
  mockDiscover = {
    data: [
      { id: 1, slug: "happy-paws", name: "Happy Paws Clinic", provider_type: "vet" },
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText } = render(<VetScreen />);

  fireEvent.press(getByText("Happy Paws Clinic"));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/service/provider",
    params: { slug: "happy-paws" },
  });
});
