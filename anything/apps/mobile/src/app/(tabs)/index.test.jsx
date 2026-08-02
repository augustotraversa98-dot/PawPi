// Feed screen — locked vs unlocked scroll behavior.
// Product rule: while locked the feed is a STATIC blurred backdrop behind the
// pinned floating card — no scroll, no pull-to-refresh. Once unlocked it scrolls
// and refreshes normally. These tests pin that on the real RefreshableScrollView
// (the feed children are stubbed so the test isolates the scroll wiring).

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockFeed;

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock("react-i18next", () =>
  require("@/i18n/testMock").makeReactI18nextMock(),
);
jest.mock("lucide-react-native", () =>
  new Proxy({}, { get: () => () => null }),
);
jest.mock("@/hooks/useFeedData", () => ({ useFeedData: () => mockFeed }));
jest.mock("@/hooks/useFeedSuggestions", () => ({
  useFeedSuggestions: () => ({ data: [] }),
}));
jest.mock("@/hooks/useFeedPosts", () => ({
  usePostingStreak: () => ({ streak: 0 }),
  useUpdatePostCaption: () => ({ mutateAsync: jest.fn() }),
}));

// Stub the feed children so the test focuses purely on the scroll view wiring.
jest.mock("@/components/Feed/FeedHeader", () => ({ FeedHeader: () => null }));
jest.mock("@/components/Feed/DailyPromptCard", () => ({
  DailyPromptCard: () => null,
}));
jest.mock("@/components/Feed/LockedFeedOverlay", () => ({
  LockedFeedOverlay: () => null,
  LockedFloatingCard: () => null,
}));
jest.mock("@/components/Feed/UnlockedFeed", () => ({ UnlockedFeed: () => null }));
jest.mock("@/components/Feed/PostComposerModal", () => ({
  PostComposerModal: () => null,
}));
jest.mock("@/components/Feed/BarkModal", () => ({ BarkModal: () => null }));
jest.mock("@/components/Feed/PostDetailModal", () => ({
  PostDetailModal: () => null,
}));

import FeedScreen from "./index";

const feedData = (overrides) => ({
  petProfile: { id: 1 },
  petName: "Rex",
  hasPostedToday: false,
  feedUnlocked: false,
  todayPostId: null,
  todayDailyUpdatePost: null,
  posts: [{ id: 1 }, { id: 2 }],
  likedPosts: {},
  handlePost: jest.fn(),
  handleToggleLike: jest.fn(),
  handleBarkAdded: jest.fn(),
  handleDeletePost: jest.fn(),
  refetchPosts: jest.fn(),
  refetchTodayDailyUpdate: jest.fn(),
  loadingPosts: false,
  postsError: false,
  uploading: false,
  ...overrides,
});

test("locked feed does not scroll", () => {
  mockFeed = feedData({ feedUnlocked: false });
  const { getByTestId } = render(<FeedScreen />);
  expect(getByTestId("feed-scroll").props.scrollEnabled).toBe(false);
});

test("unlocked feed scrolls", () => {
  mockFeed = feedData({ feedUnlocked: true });
  const { getByTestId } = render(<FeedScreen />);
  expect(getByTestId("feed-scroll").props.scrollEnabled).toBe(true);
});

test("a fetch failure with no cached posts shows an error + Retry, not the feed", () => {
  const refetchPosts = jest.fn();
  mockFeed = feedData({ postsError: true, posts: [], refetchPosts });
  const { getByText, queryByTestId } = render(<FeedScreen />);
  expect(queryByTestId("feed-scroll")).toBeNull(); // not the silent-empty feed
  expect(getByText("Something went wrong. Please try again.")).toBeTruthy();
  fireEvent.press(getByText("Try again"));
  expect(refetchPosts).toHaveBeenCalled();
});

test("an error while cached posts exist still shows the feed (transient refetch)", () => {
  mockFeed = feedData({ postsError: true, posts: [{ id: 1 }], feedUnlocked: true });
  const { getByTestId } = render(<FeedScreen />);
  expect(getByTestId("feed-scroll")).toBeTruthy();
});
