// Search & Discover on real data (ticket 2.25): the data hooks are mocked so this
// isolates the screen — Discover on first render, real Search results once typing,
// empty states, and tap-through routing. No mock discovery data is used.

import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

let mockDiscover;
let mockSearch;
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
}));
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return { Image: (props) => <View {...props} /> };
});
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// Debounce is identity here so typing reflects immediately in the test.
jest.mock("@/hooks/useSearch", () => ({
  useDebouncedValue: (v) => v,
  useSearch: () => mockSearch,
}));
jest.mock("@/hooks/useDiscover", () => ({
  useDiscover: () => mockDiscover,
}));

import SearchScreen from "./search";

beforeEach(() => {
  mockPush.mockReset();
  mockDiscover = { data: { profiles: [], moments: [] }, isLoading: false };
  mockSearch = { data: { pets: [], owners: [], providers: [] }, isLoading: false };
});

test("first render shows real Discover profiles + moments (no mock)", () => {
  mockDiscover = {
    data: {
      profiles: [
        { id: 1, name: "Cooper", breed: "Golden", owner_name: "Mike", paws: 9, barks: 3 },
      ],
      moments: [{ id: 5, pet_id: 2, image_url: "x", caption: "Beach day", pet_name: "Bella" }],
    },
    isLoading: false,
  };
  const { getByText, getByTestId } = render(<SearchScreen />);
  expect(getByText("POPULAR PROFILES")).toBeTruthy();
  expect(getByText("Cooper")).toBeTruthy();
  expect(getByText("Bella")).toBeTruthy();
  expect(getByTestId("discover-moment")).toBeTruthy();
});

test("tapping a discover profile opens the real pet profile by id", () => {
  mockDiscover = {
    data: { profiles: [{ id: 42, name: "Rex" }], moments: [] },
    isLoading: false,
  };
  const { getByTestId } = render(<SearchScreen />);
  fireEvent.press(getByTestId("discover-profile"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/pet-profile",
    params: { petId: "42" },
  });
});

test("typing a query shows real search results across pets + businesses", async () => {
  mockSearch = {
    data: {
      pets: [{ id: 1, name: "Rex", breed: "Lab", handle: "rex" }],
      owners: [],
      providers: [{ id: 9, slug: "happy-paws", name: "Happy Paws", provider_type: "vet" }],
    },
    isLoading: false,
  };
  const { getByPlaceholderText, getByText, getByTestId } = render(<SearchScreen />);

  await act(async () => {
    fireEvent.changeText(
      getByPlaceholderText("Search pets, breeds, owners, or businesses…"),
      "ha",
    );
  });

  await waitFor(() => expect(getByText("PETS")).toBeTruthy());
  expect(getByText("BUSINESSES")).toBeTruthy();
  expect(getByText("Happy Paws")).toBeTruthy();

  // Tapping a provider opens its storefront by slug.
  fireEvent.press(getByTestId("search-provider"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/service/provider",
    params: { slug: "happy-paws" },
  });
});

test("no-results query shows a clean empty state", async () => {
  mockSearch = { data: { pets: [], owners: [], providers: [] }, isLoading: false };
  const { getByPlaceholderText, getByText } = render(<SearchScreen />);

  await act(async () => {
    fireEvent.changeText(
      getByPlaceholderText("Search pets, breeds, owners, or businesses…"),
      "zzz",
    );
  });

  await waitFor(() => expect(getByText("No results")).toBeTruthy());
});

test("empty discover shows 'Nothing here yet' (no fakes)", () => {
  mockDiscover = { data: { profiles: [], moments: [] }, isLoading: false };
  const { getByText } = render(<SearchScreen />);
  expect(getByText("Nothing here yet")).toBeTruthy();
});
