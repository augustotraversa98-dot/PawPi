// Owner↔owner conversation on real data (ticket 2.27): the DM hooks + upload are mocked
// so this isolates message rendering (alignment by sender), send, and mark-read on open.

import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";

let mockMessages;
let mockParams = { threadId: "5", otherUserId: "9", otherName: "Jane Doe", otherAvatar: "" };
const mockSend = jest.fn();
const mockMarkRead = jest.fn();
const mockStartDM = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
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
  useStartDM: () => ({ mutateAsync: mockStartDM }),
}));

import ChatScreen from "./chat";

beforeEach(() => {
  mockParams = { threadId: "5", otherUserId: "9", otherName: "Jane Doe", otherAvatar: "" };
  mockStartDM.mockReset();
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

// Perf audit 2026-10-23 (F8.2): the "Message" buttons push /chat WITHOUT a threadId; the chat screen gets-or-creates it.
test("opened without a threadId: starts the 1:1 thread itself, spinner meanwhile, then marks it read", async () => {
  mockParams = { otherUserId: "9", otherName: "Jane Doe", otherAvatar: "" };
  let resolveStart;
  mockStartDM.mockReturnValue(new Promise((r) => (resolveStart = r)));
  const { queryByText } = render(<ChatScreen />);

  expect(mockStartDM).toHaveBeenCalledWith({ otherUserId: "9" });
  expect(queryByText("Say hello to start the conversation.")).toBeNull();
  expect(mockMarkRead).not.toHaveBeenCalled(); // no thread yet

  await act(async () => resolveStart({ thread: { id: 77 } }));
  expect(mockMarkRead).toHaveBeenCalledWith("77");
});

test("opened without a threadId and the thread cannot be started: a message, not an endless spinner", async () => {
  mockParams = { otherUserId: "9", otherName: "Jane Doe", otherAvatar: "" };
  mockStartDM.mockRejectedValue(new Error("nope"));
  const { findByText } = render(<ChatScreen />);
  expect(await findByText("common.somethingWrong")).toBeTruthy();
});

test("opened WITH a threadId: no thread request", () => {
  render(<ChatScreen />);
  expect(mockStartDM).not.toHaveBeenCalled();
});
