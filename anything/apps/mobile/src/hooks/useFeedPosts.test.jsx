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
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFeedPosts } from "./useFeedPosts";

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
