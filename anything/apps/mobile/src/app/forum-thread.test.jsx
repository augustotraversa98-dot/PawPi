// Render pins for the forum thread detail (ticket 2.44): thread + comments render, posting
// a comment fires the mutation, and voting on a comment toggles correctly.

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockData;
let mockComment;
let mockVote;

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: "5" }),
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
jest.mock("@/hooks/useForum", () => ({
  useForumThread: () => mockData,
  useCreateComment: () => mockComment,
  useForumVote: () => mockVote,
}));

import ForumThreadScreen from "./forum-thread";

beforeEach(() => {
  mockData = {
    data: {
      thread: {
        id: 5,
        title: "Leash pulling?",
        body: "Help",
        category: "Training",
        author_username: "mike",
        score: 1,
        my_vote: 1,
      },
      comments: [
        { id: 9, body: "Try a harness", author_username: "jane", score: 2, my_vote: null },
      ],
    },
    isLoading: false,
    refetch: jest.fn(),
  };
  mockComment = { mutate: jest.fn(), isPending: false };
  mockVote = { mutate: jest.fn(), isPending: false };
});

test("renders the thread and its comments", () => {
  const { getByText } = render(<ForumThreadScreen />);
  expect(getByText("Leash pulling?")).toBeTruthy();
  expect(getByText("Try a harness")).toBeTruthy();
  expect(getByText("1 COMMENT")).toBeTruthy();
});

test("posting a comment fires the mutation with the text", () => {
  const { getByTestId } = render(<ForumThreadScreen />);
  fireEvent.changeText(getByTestId("comment-input"), "Great tip");
  fireEvent.press(getByTestId("comment-submit"));
  expect(mockComment.mutate).toHaveBeenCalledTimes(1);
  expect(mockComment.mutate.mock.calls[0][0]).toMatchObject({ body: "Great tip" });
});

test("re-tapping the active upvote on the thread clears the vote (value 0)", () => {
  const { getByTestId } = render(<ForumThreadScreen />);
  fireEvent.press(getByTestId("thread-vote-up")); // my_vote is already 1 → toggles to 0
  expect(mockVote.mutate).toHaveBeenCalledWith({
    targetType: "thread",
    targetId: 5,
    value: 0,
  });
});

test("voting a comment fires with the comment target", () => {
  const { getByTestId } = render(<ForumThreadScreen />);
  fireEvent.press(getByTestId("comment-vote-9-up"));
  expect(mockVote.mutate).toHaveBeenCalledWith({
    targetType: "comment",
    targetId: 9,
    value: 1,
  });
});
