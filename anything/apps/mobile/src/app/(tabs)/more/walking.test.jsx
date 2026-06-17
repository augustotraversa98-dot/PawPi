// Render pins for the Dog Walking discovery + live screen (ticket 2.7):
//   - a card renders per walker from the (mocked) discovery hook — real data, no fakes;
//   - discovery is by the 'walker' capability;
//   - the empty state shows when the list is [] (no fakes);
//   - tapping a card pushes the provider detail route with the slug AND capability='walker'
//     (so the shared booking modal books a WALK, not a vet visit);
//   - a LIVE in_progress session surfaces a "Walk in progress" banner that opens the live
//     watch screen;
//   - finished sessions surface as recent walk reports.
// The data hooks + router are mocked, so this exercises the screen wiring.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockDiscover;
let mockSessions;
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
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 5, name: "Rex" } }),
}));
jest.mock("@/hooks/useProviders", () => ({
  useDiscoverProviders: (type) => {
    lastType = type;
    return mockDiscover;
  },
  useWalkSessions: () => mockSessions,
}));

import WalkingScreen from "./walking";

beforeEach(() => {
  mockPush.mockReset();
  lastType = undefined;
  mockSessions = { data: [] };
});

test("discovers providers by the walker capability", () => {
  mockDiscover = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
  render(<WalkingScreen />);
  expect(lastType).toBe("walker");
});

test("renders a card per walker from the discovery hook", () => {
  mockDiscover = {
    data: [
      { id: 1, slug: "paw-walks", name: "Paw Walks", bio: "Daily neighbourhood walks" },
      { id: 2, slug: "trots", name: "Happy Trots" },
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText } = render(<WalkingScreen />);
  expect(getByText("Paw Walks")).toBeTruthy();
  expect(getByText("Happy Trots")).toBeTruthy();
  expect(getByText("Daily neighbourhood walks")).toBeTruthy();
});

test("shows the empty state when no walkers exist (no fakes)", () => {
  mockDiscover = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
  const { getByText } = render(<WalkingScreen />);
  expect(getByText("No walkers available yet")).toBeTruthy();
});

test("tapping a card navigates to the provider detail with slug + capability=walker", () => {
  mockDiscover = {
    data: [{ id: 1, slug: "paw-walks", name: "Paw Walks" }],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText } = render(<WalkingScreen />);

  fireEvent.press(getByText("Paw Walks"));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/(tabs)/more/provider",
    params: { slug: "paw-walks", capability: "walker" },
  });
});

test("a live in_progress session surfaces a banner that opens the live watch", () => {
  mockDiscover = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
  mockSessions = {
    data: [{ id: 77, status: "in_progress", walker_name: "Sam" }],
  };
  const { getByText } = render(<WalkingScreen />);
  expect(getByText("Walk in progress")).toBeTruthy();

  fireEvent.press(getByText("Walk in progress"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/walk-live",
    params: { sessionId: "77" },
  });
});

test("finished sessions surface as recent walk reports", () => {
  mockDiscover = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
  mockSessions = {
    data: [
      {
        id: 9,
        status: "finished",
        provider_name: "Paw Walks",
        distance_m: 1609.34,
        duration_s: 1800,
      },
    ],
  };
  const { getByText } = render(<WalkingScreen />);
  expect(getByText("RECENT WALKS")).toBeTruthy();
  expect(getByText("Paw Walks")).toBeTruthy();
});
