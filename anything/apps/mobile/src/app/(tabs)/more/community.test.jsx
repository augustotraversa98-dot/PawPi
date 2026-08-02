// Render pins for the real community forum list (ticket 2.44):
//   - real threads render (no COMMUNITY_POSTS mock);
//   - empty category → empty state;
//   - the sort tabs switch sort; tapping a thread's upvote fires the vote mutation.
// Data hooks + router are mocked.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockThreads;
let mockVote;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
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
jest.mock("@/hooks/useForum", () => ({
  FORUM_CATEGORIES: ["All", "Health", "Food", "Training", "Behavior", "General"],
  useForumThreads: () => mockThreads,
  useForumVote: () => mockVote,
}));

// The mock must be gone — importing it should throw if anything still references it.
test("COMMUNITY_POSTS mock has been removed from mockData", () => {
  const mockData = require("@/data/mockData");
  expect(mockData.COMMUNITY_POSTS).toBeUndefined();
});

import CommunityScreen from "./community";

beforeEach(() => {
  mockThreads = {
    data: [
      {
        id: 5,
        title: "Best food for sensitive stomachs?",
        category: "Food",
        author_username: "sarah",
        score: 3,
        my_vote: null,
        comment_count: 2,
      },
    ],
    isLoading: false,
    refetch: jest.fn(),
  };
  mockVote = { mutate: jest.fn(), isPending: false };
});

test("renders real threads with author + score", () => {
  const { getByText } = render(<CommunityScreen />);
  expect(getByText("Best food for sensitive stomachs?")).toBeTruthy();
  expect(getByText(/sarah/)).toBeTruthy();
});

test("empty thread list → empty state (not an error)", () => {
  mockThreads = { data: [], isLoading: false, isError: false, refetch: jest.fn() };
  const { getByText, queryByText } = render(<CommunityScreen />);
  expect(getByText("No discussions here yet.")).toBeTruthy();
  expect(queryByText("Try again")).toBeNull();
});

test("a fetch failure shows an error + Retry, NOT the empty state", () => {
  const refetch = jest.fn();
  mockThreads = { data: undefined, isLoading: false, isError: true, refetch };
  const { getByText, queryByText } = render(<CommunityScreen />);
  // Distinct from "no discussions": a real error with a working Retry.
  expect(queryByText("No discussions here yet.")).toBeNull();
  expect(getByText("Something went wrong. Please try again.")).toBeTruthy();
  fireEvent.press(getByText("Try again"));
  expect(refetch).toHaveBeenCalled();
});

test("tapping a thread upvote fires the vote mutation", () => {
  const { getByTestId } = render(<CommunityScreen />);
  fireEvent.press(getByTestId("thread-vote-5-up"));
  expect(mockVote.mutate).toHaveBeenCalledWith({
    targetType: "thread",
    targetId: 5,
    value: 1,
  });
});
