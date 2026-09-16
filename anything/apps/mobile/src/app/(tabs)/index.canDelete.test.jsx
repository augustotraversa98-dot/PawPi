// Bug fix — "Can't delete your own posts". The Feed detail modal's delete/edit
// affordance must be shown for ANY post the viewer OWNS (any of their pets), not
// only the active pet's, and the id comparison must be type-safe (DB ids can
// arrive as number or string across payloads). Ownership is sourced from
// useFeedData().ownedPetIds (a Set<string> of the user's pet ids); the server
// DELETE/PATCH routes are owner-scoped by user_id as the real guard.

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
  useTogglePaw: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/components/Home/GettingStartedCard", () => ({
  GettingStartedCard: () => null,
}));
jest.mock("@/components/Feed/FeedHeader", () => ({ FeedHeader: () => null }));
jest.mock("@/components/Feed/DailyPromptCard", () => ({
  DailyPromptCard: () => null,
}));
jest.mock("@/components/Feed/LockedFeedOverlay", () => ({
  LockedFeedOverlay: () => null,
}));
jest.mock("@/components/Feed/MilestoneEventCard", () => ({
  FollowedMilestones: () => null,
}));
jest.mock("@/components/Feed/PostComposerModal", () => ({
  PostComposerModal: () => null,
}));
jest.mock("@/components/Feed/BarkModal", () => ({ BarkModal: () => null }));

// UnlockedFeed exposes a tap that opens the first post's detail (mirrors the real
// onOpenDetail wiring) so the test can exercise the detail modal's gating.
jest.mock("@/components/Feed/UnlockedFeed", () => {
  const React = require("react");
  const { Pressable, Text } = require("react-native");
  return {
    UnlockedFeed: ({ onOpenDetail, posts }) =>
      React.createElement(
        Pressable,
        { testID: "open-detail", onPress: () => onOpenDetail(posts[0]) },
        React.createElement(Text, null, "open"),
      ),
  };
});

// PostDetailModal renders the canDelete/canEdit it received, so we can assert it.
jest.mock("@/components/Feed/PostDetailModal", () => {
  const React = require("react");
  const { Text } = require("react-native");
  return {
    PostDetailModal: ({ visible, canDelete, canEdit }) =>
      visible
        ? React.createElement(
            Text,
            { testID: "detail-flags" },
            `del=${String(canDelete)}|edit=${String(canEdit)}`,
          )
        : null,
  };
});

import FeedScreen from "./index";

const feedData = (overrides) => ({
  petProfile: { id: 1 }, // active pet is #1
  ownedPetIds: new Set(["1", "2"]), // user owns pets 1 and 2
  petName: "Rex",
  hasPostedToday: true,
  feedUnlocked: true, // so UnlockedFeed (and the open-detail tap) renders
  todayPostId: null,
  todayDailyUpdatePost: null,
  posts: [],
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

function openDetailFlags(overrides) {
  mockFeed = feedData(overrides);
  const { getByTestId } = render(<FeedScreen />);
  fireEvent.press(getByTestId("open-detail"));
  return getByTestId("detail-flags").props.children;
}

test("delete/edit shown for the ACTIVE pet's own post", () => {
  expect(openDetailFlags({ posts: [{ id: 10, pet_id: 1 }] })).toBe(
    "del=true|edit=true",
  );
});

test("delete/edit shown for a NON-active pet the user also owns (bug: was hidden)", () => {
  expect(openDetailFlags({ posts: [{ id: 11, pet_id: 2 }] })).toBe(
    "del=true|edit=true",
  );
});

test("delete/edit shown despite a String/Number pet_id type mismatch", () => {
  // post.pet_id arrives as a string; ownedPetIds holds string ids — the compare
  // is type-safe so the controls still appear (bug: `===` hid them).
  expect(openDetailFlags({ posts: [{ id: 12, pet_id: "2" }] })).toBe(
    "del=true|edit=true",
  );
});

test("delete/edit HIDDEN for a post the user does not own", () => {
  expect(openDetailFlags({ posts: [{ id: 13, pet_id: 999 }] })).toBe(
    "del=false|edit=false",
  );
});

test("delete/edit HIDDEN for a business post with no owned pet_id", () => {
  expect(openDetailFlags({ posts: [{ id: 14, provider_id: 7 }] })).toBe(
    "del=false|edit=false",
  );
});
