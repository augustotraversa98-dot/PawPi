// Business mode v2 → Messages tab. Proves:
//   • the provider inbox lists the active provider's threads with the CUSTOMER (owner) name and
//     an unread badge for unread threads;
//   • tapping a thread opens the shared provider-chat with the STAFF member's own id (meUserId)
//     + the customer name as title + the owner id — so replies right-align on the provider side;
//   • empty state when there are no conversations.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-image", () => {
  const { Image } = require("react-native");
  return { Image };
});
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("@/components/RefreshableScrollView", () => {
  const { ScrollView } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <ScrollView>{children}</ScrollView> };
});

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

const mockActive = { activeProvider: { id: 7, name: "City Vets", logo_url: null }, providers: [], isLoading: false };
jest.mock("@/hooks/useActiveProvider", () => ({
  useActiveProvider: () => mockActive,
  __esModule: true,
  default: () => mockActive,
}));

const mockThreads = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
jest.mock("@/hooks/useProviders", () => ({
  useProviderThreads: () => mockThreads,
}));

const mockProfile = { data: 99 };
jest.mock("@/hooks/useUserProfile", () => ({ useMyProfileId: () => mockProfile }));

import BusinessMessages from "./messages";

beforeEach(() => {
  mockPush.mockReset();
  mockThreads.data = [];
  mockThreads.isError = false;
  mockProfile.data = 99;
});

test("lists provider threads with the customer name and an unread badge", () => {
  mockThreads.data = [
    {
      id: 3,
      owner_user_id: 42,
      owner_name: "Ana Gómez",
      unread_count: 2,
      last_message_body: "See you at 3?",
      last_message_at: new Date().toISOString(),
    },
  ];

  const { getByText, getByTestId } = render(<BusinessMessages />);
  expect(getByText("Ana Gómez")).toBeTruthy();
  expect(getByText("See you at 3?")).toBeTruthy();
  expect(getByTestId("business-thread-unread-3")).toBeTruthy();
});

test("tapping a thread opens provider-chat with meUserId + customer title + owner id", () => {
  mockThreads.data = [
    { id: 3, owner_user_id: 42, owner_name: "Ana Gómez", unread_count: 0, last_message_body: "Hi" },
  ];

  const { getByTestId } = render(<BusinessMessages />);
  fireEvent.press(getByTestId("business-thread-3"));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/provider-chat",
    params: {
      threadId: "3",
      title: "Ana Gómez",
      meUserId: "99",
      ownerUserId: "42",
    },
  });
});

test("empty state when there are no conversations", () => {
  mockThreads.data = [];
  const { getByText } = render(<BusinessMessages />);
  expect(getByText("No conversations yet")).toBeTruthy();
});
