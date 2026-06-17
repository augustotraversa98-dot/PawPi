// Owner↔owner Messages inbox on real data (ticket 2.27): the DM hook is mocked so this
// isolates the list render, empty state, and tap-through. No mock conversation data.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockThreads;
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
jest.mock("@/hooks/useDMs", () => ({
  useDMThreads: () => mockThreads,
}));

import MessagesScreen from "./messages";

beforeEach(() => {
  mockPush.mockReset();
  mockThreads = { data: [], isLoading: false };
});

test("empty state when there are no conversations (no mock fallback)", () => {
  const { getByText } = render(<MessagesScreen />);
  expect(getByText("No conversations yet")).toBeTruthy();
});

test("renders real threads with unread badge and last message", () => {
  mockThreads = {
    data: [
      {
        id: 1,
        other_user_id: 9,
        other_name: "Jane Doe",
        other_avatar_url: null,
        last_message_body: "See you at the park!",
        last_message_at: new Date().toISOString(),
        unread_count: 2,
      },
    ],
    isLoading: false,
  };
  const { getByText, getByTestId } = render(<MessagesScreen />);
  expect(getByText("Jane Doe")).toBeTruthy();
  expect(getByText("See you at the park!")).toBeTruthy();
  expect(getByText("2")).toBeTruthy(); // unread badge
  expect(getByTestId("dm-thread")).toBeTruthy();
});

test("tapping a thread opens the conversation with the right params", () => {
  mockThreads = {
    data: [
      {
        id: 3,
        other_user_id: 9,
        other_name: "Jane Doe",
        other_avatar_url: "https://x/a.png",
        last_message_body: "hi",
        last_message_at: new Date().toISOString(),
        unread_count: 0,
      },
    ],
    isLoading: false,
  };
  const { getByTestId } = render(<MessagesScreen />);
  fireEvent.press(getByTestId("dm-thread"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/chat",
    params: {
      threadId: "3",
      otherUserId: "9",
      otherName: "Jane Doe",
      otherAvatar: "https://x/a.png",
    },
  });
});
