// Owner↔owner conversation on real data (ticket 2.27): the DM hooks + upload are mocked
// so this isolates message rendering (alignment by sender), send, and mark-read on open.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockMessages;
const mockSend = jest.fn();
const mockMarkRead = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({
    threadId: "5",
    otherUserId: "9",
    otherName: "Jane Doe",
    otherAvatar: "",
  }),
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
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: "Images" },
}));
jest.mock("@/utils/useUpload", () => ({
  __esModule: true,
  default: () => [jest.fn(), { loading: false }],
}));
jest.mock("@/hooks/useDMs", () => ({
  useDMMessages: () => mockMessages,
  useSendDM: () => ({ mutate: mockSend, isPending: false }),
  useMarkDMRead: () => ({ mutate: mockMarkRead }),
}));

import ChatScreen from "./chat";

beforeEach(() => {
  mockSend.mockReset();
  mockMarkRead.mockReset();
  mockMessages = {
    data: [
      // API order is newest-first; the screen reverses for display.
      { id: 2, sender_user_id: 7, body: "Hi Jane", created_at: "2026-06-17T10:01:00Z" },
      { id: 1, sender_user_id: 9, body: "Hello there", created_at: "2026-06-17T10:00:00Z" },
    ],
    isLoading: false,
  };
});

test("renders both sides' messages and marks the thread read on open", () => {
  const { getByText } = render(<ChatScreen />);
  expect(getByText("Hello there")).toBeTruthy(); // from the other user (9)
  expect(getByText("Hi Jane")).toBeTruthy(); // mine (sender 7 != other 9)
  expect(getByText("Jane Doe")).toBeTruthy(); // header
  expect(mockMarkRead).toHaveBeenCalledWith("5");
});

test("sending a message calls the send mutation with the text", () => {
  const { getByPlaceholderText, UNSAFE_getAllByType } = render(<ChatScreen />);
  const input = getByPlaceholderText("Send a message…");
  fireEvent.changeText(input, "How are you?");
  fireEvent(input, "submitEditing");
  expect(mockSend).toHaveBeenCalledWith(
    { body: "How are you?" },
    expect.any(Object),
  );
});

test("empty conversation shows a prompt to start", () => {
  mockMessages = { data: [], isLoading: false };
  const { getByText } = render(<ChatScreen />);
  expect(getByText("Say hello to start the conversation.")).toBeTruthy();
});
