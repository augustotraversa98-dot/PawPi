// The caregiver feed lock on the phone (night run #4, item 7). The server decides who posted today for the HOUSEHOLD
// (GET /api/posts/owner-posted-today, proven in the web integration suite); here: what the Feed does with that answer,
// with the real useOwnerPostedToday / useTodayDailyUpdate hooks.
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getLocalPostDateString } from "@/utils/dateUtils";

let mockPets;
let mockPosts;
jest.mock("./usePetProfile", () => ({
  useCurrentPet: () => ({ data: mockPets[0], isLoading: false, hasPet: mockPets.length > 0 }),
  usePetProfile: () => ({ data: mockPets }),
}));
jest.mock("./useFeedPosts", () => ({
  useFeedPosts: () => ({ data: mockPosts, isLoading: false, isError: false, refetch: jest.fn() }),
  useCreatePost: () => ({ mutateAsync: jest.fn() }),
  useDeletePost: () => ({ mutateAsync: jest.fn() }),
  useTogglePaw: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock("@/utils/useUpload", () => ({ useUpload: () => [jest.fn(), { loading: false }] }));
jest.mock("@/utils/auth/useUser", () => () => ({ data: null }));
jest.mock("expo-video-thumbnails", () => ({}));

import { useFeedData } from "./useFeedData";

const own = { id: 1, name: "Rex", is_shared: false, access_role: "owner" };
const family = { ...own, is_shared: true, access_role: "family" };
const caregiver = { ...own, is_shared: true, access_role: "caregiver" };
const today = () => getLocalPostDateString();
const momentOf = (petId) => ({ id: 100 + petId, pet_id: petId, is_daily_update: true, post_date: today() });

let householdPosted;
let qc;
beforeEach(() => {
  mockPets = [caregiver];
  mockPosts = [];
  householdPosted = false;
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  global.fetch = jest.fn(async (url) => {
    const u = String(url);
    if (u.startsWith("/api/posts/owner-posted-today")) {
      return { ok: true, status: 200, json: async () => ({ hasPostedToday: householdPosted }) };
    }
    // today-daily-update answers only for the caller's OWN dog: a member of a shared dog gets 403.
    if (mockPets[0].is_shared) return { ok: false, status: 403, text: async () => "forbidden" };
    return { ok: true, status: 200, json: async () => ({ post: null }) };
  });
});
afterEach(() => {
  qc.clear();
  jest.restoreAllMocks();
});

const render = () =>
  renderHook(() => useFeedData(), {
    wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
const settled = async (result) => {
  await waitFor(() => expect(result.current.lockResolving).toBe(false));
  return result.current.feedUnlocked;
};

test("a caregiver is locked before the household posts", async () => {
  const { result } = render();
  expect(await settled(result)).toBe(false);
});

test("…and unlocked after: the next answer opens the feed", async () => {
  const { result } = render();
  expect(await settled(result)).toBe(false);
  householdPosted = true;
  await act(async () => {
    await qc.invalidateQueries({ queryKey: ["owner-posted-today"] });
  });
  await waitFor(() => expect(result.current.feedUnlocked).toBe(true));
});

test("a DIFFERENT dog's moment in the feed does not unlock", async () => {
  mockPosts = [momentOf(2), momentOf(3)];
  const { result } = render();
  expect(await settled(result)).toBe(false);
});

test("yesterday's moment of the household dog does not unlock", async () => {
  mockPosts = [{ ...momentOf(1), post_date: "2020-01-01" }];
  const { result } = render();
  expect(await settled(result)).toBe(false);
});

test("today's moment of the household dog already in the feed unlocks at once", async () => {
  mockPosts = [momentOf(1)];
  const { result } = render();
  await waitFor(() => expect(result.current.feedUnlocked).toBe(true));
});

test.each([
  ["owner", own],
  ["family", family],
])("%s: open as soon as the household has posted", async (_role, pet) => {
  mockPets = [pet];
  householdPosted = true;
  const { result } = render();
  await waitFor(() => expect(result.current.feedUnlocked).toBe(true));
});

test("shared dogs are not offered for owner-only post actions", async () => {
  const { result } = render();
  await settled(result);
  expect(result.current.ownedPetIds.size).toBe(0);
});
