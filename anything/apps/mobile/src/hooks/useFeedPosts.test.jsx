// Contract for useFeedPosts (Following-first + Suggested feed wiring):
//   - the GET carries the active pet's id as viewerPetId, read from
//     useCurrentPet() inside the hook, so the backend can order the feed
//     Following-first then Suggested (web Prompt 4);
//   - with no active pet (pet-less / still loading) viewerPetId is omitted
//     entirely and the backend serves its global fallback;
//   - the query is keyed on the active pet, so switching pets refetches and
//     re-scopes.
// fetch + useCurrentPet are mocked; no network, no DB.

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFeedPosts, useTogglePaw } from "./useFeedPosts";

// useFeedPosts reads the active pet via useCurrentPet; stub it per test.
const mockUseCurrentPet = jest.fn();
jest.mock("@/hooks/usePetProfile", () => ({
  useCurrentPet: () => mockUseCurrentPet(),
}));

function makeWrapper(queryClient) {
  return function Wrapper({ children }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function lastFetchUrl() {
  const calls = global.fetch.mock.calls;
  return calls[calls.length - 1][0];
}

afterEach(() => {
  jest.restoreAllMocks();
  mockUseCurrentPet.mockReset();
});

describe("useFeedPosts", () => {
  test("sends viewerPetId from the active pet and returns posts in endpoint order", async () => {
    mockUseCurrentPet.mockReturnValue({ data: { id: 4, name: "Phoebe" } });
    const ordered = [{ id: 10 }, { id: 11 }]; // Following first, then Suggested
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ posts: ordered }),
    }));

    const { result } = renderHook(() => useFeedPosts(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const url = lastFetchUrl();
    expect(url).toContain("viewerPetId=4");
    expect(url).toContain("limit=20");
    expect(url).toContain("offset=0");
    // Order is preserved exactly as the endpoint returned it (no re-sort).
    expect(result.current.data).toBe(ordered);
  });

  test("omits viewerPetId when there is no active pet (global fallback)", async () => {
    mockUseCurrentPet.mockReturnValue({ data: null });
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ posts: [] }),
    }));

    const { result } = renderHook(() => useFeedPosts(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const url = lastFetchUrl();
    expect(url).not.toContain("viewerPetId");
    expect(url).toContain("/api/posts?");
  });

  test("refetches and re-scopes when the active pet changes", async () => {
    mockUseCurrentPet.mockReturnValue({ data: { id: 4, name: "Phoebe" } });
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ posts: [] }),
    }));

    // Share one client so the query key drives the refetch, not a remount.
    const client = makeClient();
    const { rerender } = renderHook(() => useFeedPosts(), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(lastFetchUrl()).toContain("viewerPetId=4");

    // Switch the active pet — the viewerPetId in the query key changes, so the
    // feed fetches again under the new scope.
    mockUseCurrentPet.mockReturnValue({ data: { id: 9, name: "Rex" } });
    rerender();

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(lastFetchUrl()).toContain("viewerPetId=9");
  });
});

// Feed polish #2 — paw fill + count are ONE source of truth (the shared feed
// cache). A paw/un-paw anywhere flips `user_has_pawed` AND moves `paw_count`
// together in that cache, so a feed card can never show a filled paw over a
// stale "0" (or a hollow paw over a count). These tests pin the shared-cache
// optimistic update the feed card and the detail modal both go through.
describe("useTogglePaw — shared-cache paw sync", () => {
  const feedKey = ["posts", "feed", 20, 0, 4];

  function seedFeed(client, post) {
    client.setQueryData(feedKey, [post]);
  }
  function currentPost(client, id) {
    return client.getQueryData(feedKey).find((p) => p.id === id);
  }

  test("pawing an un-pawed post flips the flag AND increments the count together", async () => {
    mockUseCurrentPet.mockReturnValue({ data: { id: 4 } });
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
    const client = makeClient();
    seedFeed(client, { id: 10, user_has_pawed: false, paw_count: 2 });

    const { result } = renderHook(() => useTogglePaw(10), {
      wrapper: makeWrapper(client),
    });

    // isPawed reflects the CURRENT state (not pawed) → POST + optimistic +1.
    await act(async () => {
      await result.current.mutateAsync({ isPawed: false });
    });

    const post = currentPost(client, 10);
    expect(post.user_has_pawed).toBe(true);
    expect(post.paw_count).toBe(3);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/posts/10/paw",
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("un-pawing flips the flag AND decrements the count together (fixes filled-over-0 desync)", async () => {
    mockUseCurrentPet.mockReturnValue({ data: { id: 4 } });
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
    const client = makeClient();
    seedFeed(client, { id: 10, user_has_pawed: true, paw_count: 1 });

    const { result } = renderHook(() => useTogglePaw(10), {
      wrapper: makeWrapper(client),
    });

    // isPawed=true (currently pawed) → DELETE + optimistic -1.
    await act(async () => {
      await result.current.mutateAsync({ isPawed: true });
    });

    const post = currentPost(client, 10);
    // Flag and count move TOGETHER — never a filled paw over 0.
    expect(post.user_has_pawed).toBe(false);
    expect(post.paw_count).toBe(0);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/posts/10/paw",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  test("un-pawing never drives the count below zero", async () => {
    mockUseCurrentPet.mockReturnValue({ data: { id: 4 } });
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
    const client = makeClient();
    // Degenerate seed: flagged pawed but count already 0.
    seedFeed(client, { id: 10, user_has_pawed: true, paw_count: 0 });

    const { result } = renderHook(() => useTogglePaw(10), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ isPawed: true });
    });

    const post = currentPost(client, 10);
    expect(post.user_has_pawed).toBe(false);
    expect(post.paw_count).toBe(0); // clamped, not -1
  });
});
