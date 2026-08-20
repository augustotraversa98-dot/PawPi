// Render pins for buddy-walk discovery (ticket 2.43):
//   - public ("Nearby") walks render in a list;
//   - the Nearby/Invited tabs switch the data source;
//   - tapping "Request to join" then "Send Request" fires the join mutation (RSVP).
// expo-location, the data hooks, and RefreshableScrollView are mocked.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockNearby;
let mockInvited;
let mockJoin;

jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: "denied" }),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: { id: 1, name: "Rex" } }),
}));
jest.mock("@/hooks/useSocialWalks", () => ({
  useSocialWalks: (visibility, myWalks, options = {}) =>
    options.invited ? mockInvited : mockNearby,
  useJoinSocialWalk: () => mockJoin,
}));

import NearbyWalksPage from "./nearby-walks";

beforeEach(() => {
  mockNearby = {
    data: [
      {
        id: 50,
        walk_name: "Park loop",
        scheduled_at: "2026-09-01T09:00:00Z",
        duration_minutes: 30,
        owner_username: "jane",
        max_pets: 4,
        approval_required: true,
        approved_participants_count: 0,
      },
    ],
    isLoading: false,
    refetch: jest.fn(),
  };
  mockInvited = { data: [], isLoading: false, refetch: jest.fn() };
  mockJoin = { mutate: jest.fn(), isPending: false };
});

test("renders public walks in the Nearby tab", () => {
  const { getByText } = render(<NearbyWalksPage />);
  expect(getByText("Park loop")).toBeTruthy();
  expect(getByText(/Hosted by jane/)).toBeTruthy();
});

test("switching to the Invited tab shows the invited empty state", () => {
  const { getByTestId, getByText } = render(<NearbyWalksPage />);
  fireEvent.press(getByTestId("tab-invited"));
  expect(getByText("No invites yet")).toBeTruthy();
});

test("RSVP: request to join → send fires the join mutation", () => {
  const { getByText } = render(<NearbyWalksPage />);
  fireEvent.press(getByText("Request to join")); // open the modal
  fireEvent.press(getByText("Send Request")); // submit
  expect(mockJoin.mutate).toHaveBeenCalledTimes(1);
  expect(mockJoin.mutate.mock.calls[0][0]).toMatchObject({
    socialWalkId: 50,
    petId: 1,
  });
});
