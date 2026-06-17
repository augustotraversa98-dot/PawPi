// Unified Messages hub (ticket 2.40): owner↔owner DMs + owner↔business threads in
// one list with an All/People/Businesses filter and an owner search to start a DM.
// All hooks are mocked so this isolates the merge/filter/route/search wiring.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";

let mockDM;
let mockBiz;
let mockSearch;
const mockPush = jest.fn();
const mockStartDM = jest.fn();

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
  useDMThreads: () => mockDM,
  useStartDM: () => ({ mutateAsync: mockStartDM }),
}));
jest.mock("@/hooks/useProviders", () => ({
  useMyThreads: () => mockBiz,
}));
jest.mock("@/hooks/useSearch", () => ({
  useSearch: () => mockSearch,
  useDebouncedValue: (v) => v,
}));

import MessagesScreen from "./messages";

beforeEach(() => {
  mockPush.mockReset();
  mockStartDM.mockReset();
  mockDM = { data: [], isLoading: false };
  mockBiz = { data: [], isLoading: false };
  mockSearch = { data: { owners: [] }, isFetching: false };
});

const dm = {
  id: 3,
  other_user_id: 9,
  other_name: "Jane Doe",
  other_avatar_url: "https://x/a.png",
  last_message_body: "hi",
  last_message_at: "2026-06-18T10:00:00.000Z",
  unread_count: 2,
};
const biz = {
  id: 7,
  provider_name: "Happy Paws Vet",
  owner_user_id: 5,
  last_message_body: "Your appointment is confirmed",
  last_message_at: "2026-06-18T11:00:00.000Z",
  unread_count: 0,
};

test("empty state when there are no conversations (no mock fallback)", () => {
  const { getByText } = render(<MessagesScreen />);
  expect(getByText("No conversations yet")).toBeTruthy();
});

test("lists BOTH people DMs and business threads together", () => {
  mockDM = { data: [dm], isLoading: false };
  mockBiz = { data: [biz], isLoading: false };
  const { getByText } = render(<MessagesScreen />);
  expect(getByText("Jane Doe")).toBeTruthy();
  expect(getByText("Happy Paws Vet")).toBeTruthy();
});

test("the People / Businesses filter scopes the list", () => {
  mockDM = { data: [dm], isLoading: false };
  mockBiz = { data: [biz], isLoading: false };
  const { getByText, queryByText } = render(<MessagesScreen />);

  fireEvent.press(getByText("People"));
  expect(getByText("Jane Doe")).toBeTruthy();
  expect(queryByText("Happy Paws Vet")).toBeNull();

  fireEvent.press(getByText("Businesses"));
  expect(getByText("Happy Paws Vet")).toBeTruthy();
  expect(queryByText("Jane Doe")).toBeNull();
});

test("tapping a DM opens /chat; a business opens /provider-chat", () => {
  mockDM = { data: [dm], isLoading: false };
  mockBiz = { data: [biz], isLoading: false };
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

  fireEvent.press(getByTestId("biz-thread"));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/provider-chat",
    params: { threadId: "7", providerName: "Happy Paws Vet", ownerUserId: "5" },
  });
});

test("searching an owner and tapping starts a DM and opens /chat", async () => {
  mockSearch = {
    data: { owners: [{ id: 42, full_name: "Sam Park", avatar_url: null }] },
    isFetching: false,
  };
  mockStartDM.mockResolvedValue({ thread: { id: 99 } });

  const { getByPlaceholderText, getByTestId } = render(<MessagesScreen />);
  fireEvent.changeText(
    getByPlaceholderText("Search people or start a new chat…"),
    "sam",
  );
  fireEvent.press(getByTestId("owner-result"));

  expect(mockStartDM).toHaveBeenCalledWith({ otherUserId: 42 });
  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/chat",
      params: {
        threadId: "99",
        otherUserId: "42",
        otherName: "Sam Park",
        otherAvatar: "",
      },
    }),
  );
});
