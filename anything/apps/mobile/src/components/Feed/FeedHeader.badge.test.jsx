// The bell badge counts real server notifications (notifications v2): a DB notification alone lights it,
// and with no unread_count (server flag off → 0) it is exactly the old reminders + access-requests number.

import React from "react";
import { render } from "@testing-library/react-native";

let mockReminderCount = 0;
let mockGrants = [];
let mockDbUnread = 0;

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/ui", () => {
  const React = require("react");
  const { View, TouchableOpacity } = require("react-native");
  return {
    GlassSurface: ({ children }) => <View>{children}</View>,
    PressableScale: ({ children, onPress }) => <TouchableOpacity onPress={onPress}>{children}</TouchableOpacity>,
    PawMark: () => null,
  };
});
jest.mock("@/store/socialPetStore", () => ({
  __esModule: true,
  default: (selector) => selector({ unreadNotificationCount: mockReminderCount }),
}));
jest.mock("@/components/Pets/PetSwitcher", () => ({ PetSwitcher: () => null }));
jest.mock("@/components/Health/StreakChip", () => ({ StreakChip: () => null }));
jest.mock("@/hooks/useCareAccessGrants", () => ({ useAllCareAccessGrants: () => ({ data: mockGrants }) }));
jest.mock("@/hooks/usePetProfile", () => ({ useCurrentPet: () => ({ data: { id: 1 } }) }));
jest.mock("@/hooks/useNotifications", () => ({ useUnreadNotificationCount: () => ({ data: mockDbUnread }) }));

import { FeedHeader } from "./FeedHeader";

beforeEach(() => {
  mockReminderCount = 0;
  mockGrants = [];
  mockDbUnread = 0;
});

it("shows NO badge when nothing is unread", () => {
  const { queryByText } = render(<FeedHeader />);
  expect(queryByText("1")).toBeNull();
});

it("a server notification alone lights the badge (the bug: it never did)", () => {
  mockDbUnread = 3;
  const { getByText } = render(<FeedHeader />);
  expect(getByText("3")).toBeTruthy();
});

it("adds up local reminders, pending access requests and server notifications", () => {
  mockReminderCount = 2;
  mockGrants = [{ status: "pending" }, { status: "accepted" }];
  mockDbUnread = 4;
  const { getByText } = render(<FeedHeader />);
  expect(getByText("7")).toBeTruthy();
});

it("flag off (no unread_count → 0): exactly the old reminders + access-requests number", () => {
  mockReminderCount = 2;
  mockGrants = [{ status: "pending" }];
  mockDbUnread = 0;
  const { getByText } = render(<FeedHeader />);
  expect(getByText("3")).toBeTruthy();
});

it("caps at 9+", () => {
  mockDbUnread = 25;
  const { getByText } = render(<FeedHeader />);
  expect(getByText("9+")).toBeTruthy();
});
