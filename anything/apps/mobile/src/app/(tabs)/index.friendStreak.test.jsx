// A friend's streak on the REAL Feed screen (real UnlockedFeed / LockedFeedOverlay / PostCard / hook; only
// the network and a few leaf widgets are faked): flame + number by a friend's dog's name, nothing for a dog
// the server leaves out, and the viewer's own flame unchanged.

import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockFeed;
let mockOwnStreak;
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("expo-av", () => {
  const { View } = require("react-native");
  return { __esModule: true, Video: (props) => <View testID={props.testID} />, ResizeMode: { COVER: "cover" } };
});
jest.mock("@/hooks/useFeedData", () => ({ useFeedData: () => mockFeed }));
jest.mock("@/hooks/useFeedPosts", () => ({
  usePostingStreak: () => ({ streak: mockOwnStreak }),
  useTogglePaw: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }),
  useUpdatePostCaption: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock("@/hooks/useUserProfile", () => ({ useMyProfileId: () => ({ data: 1 }) }));
jest.mock("@/hooks/useFeedSuggestions", () => ({ useFeedSuggestions: () => ({ data: null }) }));
jest.mock("@/components/Home/GettingStartedCard", () => ({ GettingStartedCard: () => null }));
jest.mock("@/components/Feed/FeedHeader", () => ({ FeedHeader: () => null }));
jest.mock("@/components/Feed/DailyPromptCard", () => ({ DailyPromptCard: () => null }));
jest.mock("@/components/Feed/MilestoneEventCard", () => ({ FollowedMilestones: () => null }));
jest.mock("@/components/Feed/PostComposerModal", () => ({ PostComposerModal: () => null }));
jest.mock("@/components/Feed/BarkModal", () => ({ BarkModal: () => null }));
jest.mock("@/components/Feed/PostDetailModal", () => ({ PostDetailModal: () => null }));
jest.mock("@/hooks/useBottomClearance", () => () => 0);

import FeedScreen from "./index";

const post = (id, petId, name) => ({
  id,
  pet_id: petId,
  pet_name: name,
  image_url: "https://example.com/p.jpg",
  created_at: "2026-01-01T10:00:00Z",
});

const feed = (overrides) => ({
  petProfile: { id: 1 },
  petName: "Rex",
  householdPetIds: new Set(["1"]),
  ownedPetIds: new Set(["1"]),
  feedUnlocked: true,
  posts: [post(10, 1, "Rex"), post(11, 2, "Bella"), post(12, 3, "Coco")],
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

const renderFeed = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={client}>
      <FeedScreen />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  mockOwnStreak = 3;
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ available: true, streaks: [{ pet_id: 2, streak: 9 }] }),
  }));
});

test.each([
  ["unlocked", true],
  ["locked", false],
])("%s feed: the friend's flame shows by the name; one request, never for the viewer's own dog", async (_l, feedUnlocked) => {
  mockFeed = feed({ feedUnlocked });
  const view = renderFeed();
  await waitFor(() => expect(view.getByText("🔥9")).toBeTruthy());
  expect(view.getByLabelText("9 day streak")).toBeTruthy();
  // Coco (not returned by the server) shows nothing extra.
  expect(view.getAllByText(/🔥/)).toHaveLength(feedUnlocked ? 2 : 1);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenCalledWith("/api/posts/friend-streaks?petIds=2,3");
});

test("the viewer's own flame is unchanged (any length, from the posting streak)", async () => {
  mockFeed = feed();
  const view = renderFeed();
  await waitFor(() => expect(view.getByText("🔥9")).toBeTruthy());
  expect(view.getByText("🔥3")).toBeTruthy();
});

test("business posts are never asked about", async () => {
  mockFeed = feed({ posts: [{ id: 5, item_type: "provider_post", pet_id: 8, provider: { name: "Vet" } }] });
  renderFeed();
  await waitFor(() => expect(global.fetch).not.toHaveBeenCalled());
});
