// Feed lock × role × dog × "household posted today" (night run #5, item 3), on the REAL Feed screen: real useFeedData, real
// LockedFeedOverlay / UnlockedFeed / PostCard; only the network and a few leaf widgets are faked.
//
// What the lock is (server: api/utils/dailyMomentsGate.js): "post to see OTHER people's moments". The viewer's HOUSEHOLD is never
// covered — a dog they own, or one they hold an active family / caregiver grant on. Only a caregiver (who cannot post a moment)
// is told what opens the Feed instead of being asked to post.
//
//   household posted today = YES → the Feed is open for every role: nothing blurred anywhere.
//   household posted today = NO  → other people's posts are blurred (server redaction); a post of ANY household dog is NOT;
//                                  owner + family get the post button, a caregiver gets the explanation and no button —
//                                  UNLESS that caregiver also owns a dog (night run #6, item 3): posting for their OWN dog is allowed
//                                  by the server and opens the Feed, so they get the button and the composer posts for that dog.

import React from "react";
import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockPets;
let mockPosts;
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
jest.mock("expo-video-thumbnails", () => ({}));
jest.mock("@/utils/useUpload", () => ({ useUpload: () => [jest.fn(), { loading: false }] }));
jest.mock("@/utils/auth/useUser", () => () => ({ data: null }));
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => ({ data: mockPets[0], isLoading: false, hasPet: mockPets.length > 0 }),
  usePetProfile: () => ({ data: mockPets }),
}));
jest.mock("@/hooks/useFeedPosts", () => ({
  useFeedPosts: () => ({ data: mockPosts, isLoading: false, isError: false, refetch: jest.fn() }),
  useCreatePost: () => ({ mutateAsync: jest.fn() }),
  useDeletePost: () => ({ mutateAsync: jest.fn() }),
  useTogglePaw: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }),
  usePostingStreak: () => ({ streak: 0 }),
  useUpdatePostCaption: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock("@/hooks/useUserProfile", () => ({ useMyProfileId: () => ({ data: 1 }) }));
jest.mock("@/hooks/useFeedSuggestions", () => ({ useFeedSuggestions: () => ({ data: null }) }));
jest.mock("@/components/Home/GettingStartedCard", () => ({ GettingStartedCard: () => null }));
jest.mock("@/components/Feed/FeedHeader", () => ({ FeedHeader: () => null }));
jest.mock("@/components/Feed/MilestoneEventCard", () => ({ FollowedMilestones: () => null }));
// Shows WHICH dog the composer posts for, so the tests can see it.
jest.mock("@/components/Feed/PostComposerModal", () => {
  const { Text } = require("react-native");
  return { PostComposerModal: ({ visible, petName }) => (visible ? <Text testID="composer-open">{petName}</Text> : null) };
});
jest.mock("@/components/Feed/BarkModal", () => ({ BarkModal: () => null }));
jest.mock("@/components/Feed/PostDetailModal", () => ({ PostDetailModal: () => null }));
jest.mock("@/hooks/useBottomClearance", () => () => 0);

import FeedScreen from "./index";

const dog = (id, name, role) => ({
  id,
  name,
  is_shared: role !== "owner",
  access_role: role,
});
const OWN = dog(1, "Rex", "owner");
const FAMILY_DOG = dog(2, "Luna", "family");
const CAREGIVER_DOG = dog(3, "Mia", "caregiver");
const STRANGER_DOG_ID = 9;

const moment = (id, petId) => ({
  id,
  pet_id: petId,
  pet_name: `Dog${petId}`,
  pet_handle: `dog${petId}`,
  username: "Someone",
  image_url: `https://example.com/${id}.jpg`,
  caption: `caption ${id}`,
  is_daily_update: true,
  post_date: "2020-01-01", // an OLDER moment, never today's
});

let householdPosted;
let qc;
beforeEach(() => {
  householdPosted = false;
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  global.fetch = jest.fn(async (url) => {
    const u = String(url);
    if (u.startsWith("/api/posts/owner-posted-today")) {
      return { ok: true, status: 200, json: async () => ({ hasPostedToday: householdPosted }) };
    }
    // today-daily-update answers only for a dog the person owns; a shared dog answers 403 (as on the server).
    if (mockPets[0].is_shared) return { ok: false, status: 403, text: async () => "forbidden" };
    return { ok: true, status: 200, json: async () => ({ post: null }) };
  });
});
afterEach(() => {
  qc.clear();
  jest.restoreAllMocks();
});

const renderFeed = () =>
  render(
    <QueryClientProvider client={qc}>
      <FeedScreen />
    </QueryClientProvider>,
  );

// The person's household always holds all three kinds of dog; the ACTIVE dog (pets[0]) decides the role shown on screen.
const ROLES = [
  ["owner", [OWN, FAMILY_DOG, CAREGIVER_DOG]],
  ["family", [FAMILY_DOG, OWN, CAREGIVER_DOG]],
  // a caregiver with no dog of their own (their other shared dog, as family, is NOT a dog they own)
  ["caregiver", [CAREGIVER_DOG, FAMILY_DOG]],
  // a caregiver on the active dog who also owns a dog
  ["caregiver who owns a dog", [CAREGIVER_DOG, OWN, FAMILY_DOG]],
];
const DOGS = [
  ["own dog", 1],
  ["a dog shared with them as family", 2],
  ["a dog shared with them as caregiver", 3],
];

const blurredCards = (screen) => [
  ...screen.queryAllByTestId("feed-post-locked-media"),
  ...screen.queryAllByTestId("feed-post-locked-solid"),
];
const lockedCaptions = (screen) => screen.queryAllByTestId("feed-post-caption-locked");

describe.each(ROLES)("viewer is %s on the active dog", (role, pets) => {
  // only the dogs that are in this person's household (a dog they have no access to is a stranger's dog)
  describe.each(DOGS.filter(([, id]) => pets.some((p) => p.id === id)))("older post of %s", (_label, petId) => {
    it("household has NOT posted today: that post is never blurred or hidden; another person's still is", async () => {
      mockPets = pets;
      mockPosts = [moment(100 + petId, petId), moment(200, STRANGER_DOG_ID)];
      const screen = renderFeed();
      // the lock state resolves, then the locked Feed renders
      await waitFor(() => expect(blurredCards(screen).length).toBeGreaterThan(0));
      // exactly ONE blurred card (the stranger's) and ONE obscured caption — never the household dog's
      expect(blurredCards(screen)).toHaveLength(1);
      expect(lockedCaptions(screen)).toHaveLength(1);
      // the household dog's caption is readable, the stranger's is not
      expect(screen.getByText(new RegExp(`caption ${100 + petId}$`))).toBeTruthy();
      expect(screen.queryByText(/caption 200$/)).toBeNull();
    });

    it("household HAS posted today: the Feed is open — nothing blurred anywhere", async () => {
      householdPosted = true;
      mockPets = pets;
      mockPosts = [moment(100 + petId, petId), moment(200, STRANGER_DOG_ID)];
      const screen = renderFeed();
      await waitFor(() => expect(screen.getByText(/caption 200$/)).toBeTruthy());
      expect(screen.getByText(new RegExp(`caption ${100 + petId}$`))).toBeTruthy();
      expect(blurredCards(screen)).toHaveLength(0);
      expect(lockedCaptions(screen)).toHaveLength(0);
      expect(screen.queryAllByTestId("feed-post-locked-cta")).toHaveLength(0);
    });
  });

  it("household has NOT posted: only a caregiver is told what opens the Feed (no post button); owner and family keep the button", async () => {
    mockPets = pets;
    mockPosts = [moment(200, STRANGER_DOG_ID)];
    const screen = renderFeed();
    await waitFor(() => expect(blurredCards(screen)).toHaveLength(1));
    const WAITING = /^Opens as soon as today's moment for .* is posted\.$/;
    if (role === "caregiver") {
      expect(screen.queryAllByText(WAITING).length).toBeGreaterThan(0);
      expect(screen.queryAllByTestId("feed-post-locked-cta")).toHaveLength(0);
    } else {
      expect(screen.queryAllByText(WAITING)).toHaveLength(0);
      expect(screen.getAllByTestId("feed-post-locked-cta").length).toBeGreaterThan(0);
    }
  });

  it("the post button opens the composer for the dog the person may post for (own dog for a caregiver who owns one); none for a caregiver alone", async () => {
    mockPets = pets;
    mockPosts = [moment(200, STRANGER_DOG_ID)];
    const screen = renderFeed();
    await waitFor(() => expect(blurredCards(screen)).toHaveLength(1));
    if (role === "caregiver") {
      expect(screen.queryAllByTestId("feed-post-locked-cta")).toHaveLength(0);
      expect(screen.queryByTestId("composer-open")).toBeNull();
    } else {
      fireEvent.press(screen.getAllByTestId("feed-post-locked-cta")[0]);
      const expected = role === "family" ? "Luna" : "Rex"; // family: the active shared dog; owner / caregiver-who-owns: Rex (own)
      expect(screen.getByTestId("composer-open").props.children).toBe(expected);
    }
  });
});

it("a household with only the viewer's own old posts shows them all, with no locked card at all", async () => {
  mockPets = [OWN];
  mockPosts = [moment(1, 1), moment(2, 1)];
  const screen = renderFeed();
  await waitFor(() => expect(screen.getByText(/caption 1$/)).toBeTruthy());
  expect(screen.getByText(/caption 2$/)).toBeTruthy();
  expect(blurredCards(screen)).toHaveLength(0);
});
