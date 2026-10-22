// Feed screen — scroll behavior.
// Product rule (feed polish #4): the feed scrolls whether locked or unlocked. A
// frozen locked feed read as buggy; now it's a scrollable, blurred FOMO tease.
// These tests pin that on the real RefreshableScrollView (the feed children are
// stubbed so the test isolates the scroll wiring).

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

let mockFeed;
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
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
  useTogglePaw: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }),
}));

// Stub the feed children so the test focuses purely on the scroll view wiring.
jest.mock("@/components/Home/GettingStartedCard", () => ({
  GettingStartedCard: () => null,
}));
jest.mock("@/components/Feed/FeedHeader", () => ({ FeedHeader: () => null }));
jest.mock("@/components/Feed/DailyPromptCard", () => ({
  DailyPromptCard: () => null,
}));
// The locked overlay is stubbed to two tap targets that forward to the props the
// screen wires: a pet name/avatar tap (onOpenProfile) and the post CTA (onPostPress).
jest.mock("@/components/Feed/LockedFeedOverlay", () => {
  const { Pressable } = require("react-native");
  return {
    LockedFeedOverlay: ({ posts, onOpenProfile, onPostPress }) => (
      <>
        <Pressable testID="locked-name" onPress={() => onOpenProfile(posts[0])} />
        <Pressable testID="locked-post-cta" onPress={onPostPress} />
      </>
    ),
  };
});
jest.mock("@/components/Feed/UnlockedFeed", () => ({ UnlockedFeed: () => null }));
jest.mock("@/components/Feed/MilestoneEventCard", () => ({ FollowedMilestones: () => null }));
jest.mock("@/components/Feed/PostComposerModal", () => {
  const { View } = require("react-native");
  return {
    PostComposerModal: ({ visible }) =>
      visible ? <View testID="composer-open" /> : null,
  };
});
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

test("locked feed still scrolls (FOMO tease, not a frozen wall)", () => {
  mockFeed = feedData({ feedUnlocked: false });
  const { getByTestId } = render(<FeedScreen />);
  expect(getByTestId("feed-scroll").props.scrollEnabled).toBe(true);
});

beforeEach(() => mockPush.mockClear());

test("locked feed: tapping a pet name/avatar opens THAT pet's profile, not the composer", () => {
  mockFeed = feedData({
    feedUnlocked: false,
    posts: [{ id: 9, pet_id: 42, pet_handle: "phoebe", pet_name: "Phoebe" }],
  });
  const { getByTestId, queryByTestId } = render(<FeedScreen />);
  fireEvent.press(getByTestId("locked-name"));
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush.mock.calls[0][0]).toMatchObject({
    pathname: "/pet-profile",
    params: { petId: "42", petHandle: "phoebe", dogName: "Phoebe" },
  });
  expect(queryByTestId("composer-open")).toBeNull();
});

test("locked feed: the explicit post CTA opens the composer, not a profile", () => {
  mockFeed = feedData({ feedUnlocked: false, posts: [{ id: 9, pet_id: 42 }] });
  const { getByTestId, queryByTestId } = render(<FeedScreen />);
  expect(queryByTestId("composer-open")).toBeNull();
  fireEvent.press(getByTestId("locked-post-cta"));
  expect(getByTestId("composer-open")).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
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
