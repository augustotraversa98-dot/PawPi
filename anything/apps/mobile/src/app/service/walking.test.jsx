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
import { render, fireEvent, waitFor } from "@testing-library/react-native";

let mockDiscover;
let mockSessions;
let mockMyRequests;
let lastType;
const mockPush = jest.fn();
const mockCreateAsync = jest.fn().mockResolvedValue({ request: { id: 1 } });
const mockCancelAsync = jest.fn().mockResolvedValue({ request: { id: 1 } });

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
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 5, name: "Rex" } }),
}));
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: { latitude: -34.6, longitude: -58.4 },
  }),
  Accuracy: { Balanced: 3 },
}));
jest.mock("@/hooks/useProviders", () => ({
  useDiscoverProviders: (type) => {
    lastType = type;
    return mockDiscover;
  },
  useWalkSessions: () => mockSessions,
  useCreateWalkRequest: () => ({ mutateAsync: mockCreateAsync, isPending: false }),
  useCancelWalkRequest: () => ({ mutateAsync: mockCancelAsync, isPending: false }),
  useMyWalkRequests: () => mockMyRequests,
}));

import WalkingScreen from "./walking";

beforeEach(() => {
  mockPush.mockReset();
  mockCreateAsync.mockClear();
  mockCancelAsync.mockClear();
  lastType = undefined;
  mockSessions = { data: [] };
  mockMyRequests = { data: [] };
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
    pathname: "/service/provider",
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

test("each walker card shows a 'Request a walk' CTA (ticket C1)", () => {
  mockDiscover = {
    data: [{ id: 1, slug: "paw-walks", name: "Paw Walks" }],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText } = render(<WalkingScreen />);
  expect(getByText("Request a walk")).toBeTruthy();
});

test("requesting a walk submits target_provider_id for the active pet", async () => {
  mockDiscover = {
    data: [{ id: 1, slug: "paw-walks", name: "Paw Walks" }],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  };
  const { getByText, getByTestId } = render(<WalkingScreen />);

  // Open the request modal, then send it.
  fireEvent.press(getByTestId("request-walk-1"));
  fireEvent.press(getByTestId("request-submit"));

  await waitFor(() => expect(mockCreateAsync).toHaveBeenCalled());
  expect(mockCreateAsync).toHaveBeenCalledWith(
    expect.objectContaining({ pet_id: 5, target_provider_id: 1, when_type: "now" }),
  );
});

test("a live request shows a waiting-for-a-walker status card", () => {
  mockDiscover = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
  mockMyRequests = {
    data: [{ id: 42, is_live: true, status: "open", target_provider_name: "Paw Walks" }],
  };
  const { getByText, getByTestId } = render(<WalkingScreen />);
  expect(getByText("Waiting for a walker")).toBeTruthy();
  // Cancel wires to the cancel mutation.
  fireEvent.press(getByTestId("cancel-request-42"));
  expect(mockCancelAsync).toHaveBeenCalledWith({ requestId: 42 });
});
