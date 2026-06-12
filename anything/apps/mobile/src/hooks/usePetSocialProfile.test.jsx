// Contract for the Dog Social Profile data layer:
//   - usePetSocialProfile GETs the profile route (with ?viewerPetId when given),
//     and stays idle until a petId is present;
//   - useToggleFollow optimistically flips isFollowing and nudges
//     stats.followers on the ["petProfile", petId] cache before the request
//     resolves, and rolls that back if the request fails.
// fetch is mocked; no network, no DB.

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePetSocialProfile, useToggleFollow } from "./usePetSocialProfile";

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
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("usePetSocialProfile", () => {
  test("fetches the profile route with the viewer pet and returns the payload", async () => {
    const payload = {
      pet: { id: 7, name: "Rex", handle: "rex" },
      owner: { username: "alice" },
      stats: { totalPosts: 2, followers: 3 },
      isFollowing: true,
      posts: [],
    };
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => payload }));

    const { result } = renderHook(() => usePetSocialProfile("7", 4), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith("/api/pets/7/profile?viewerPetId=4");
    expect(result.current.data.pet.name).toBe("Rex");
    expect(result.current.data.isFollowing).toBe(true);
  });

  test("omits the viewerPetId query when there is no active pet", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ pet: { id: 7 }, stats: {}, posts: [] }),
    }));

    const { result } = renderHook(() => usePetSocialProfile("7", undefined), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith("/api/pets/7/profile");
  });

  test("stays idle until a petId is present", () => {
    global.fetch = jest.fn();

    const { result } = renderHook(() => usePetSocialProfile("", 4), {
      wrapper: makeWrapper(makeClient()),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("useToggleFollow", () => {
  test("optimistically follows: isFollowing→true and followers+1 before the request settles", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ following: true, followersCount: 4 }),
    }));
    const qc = makeClient();
    qc.setQueryData(["petProfile", "7"], {
      isFollowing: false,
      stats: { followers: 3 },
    });

    const { result } = renderHook(() => useToggleFollow("7"), {
      wrapper: makeWrapper(qc),
    });

    act(() => {
      result.current.mutate({ isFollowing: false, viewerPetId: 4 });
    });

    await waitFor(() => {
      const cached = qc.getQueryData(["petProfile", "7"]);
      expect(cached.isFollowing).toBe(true);
      expect(cached.stats.followers).toBe(4);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/pets/7/follow",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ followerPetId: 4 }),
      }),
    );
  });

  test("optimistically unfollows: isFollowing→false and followers-1", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ following: false, followersCount: 2 }),
    }));
    const qc = makeClient();
    qc.setQueryData(["petProfile", "7"], {
      isFollowing: true,
      stats: { followers: 3 },
    });

    const { result } = renderHook(() => useToggleFollow("7"), {
      wrapper: makeWrapper(qc),
    });

    act(() => {
      result.current.mutate({ isFollowing: true, viewerPetId: 4 });
    });

    await waitFor(() => {
      const cached = qc.getQueryData(["petProfile", "7"]);
      expect(cached.isFollowing).toBe(false);
      expect(cached.stats.followers).toBe(2);
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/pets/7/follow",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  test("rolls back the optimistic update when the request fails", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
    const qc = makeClient();
    qc.setQueryData(["petProfile", "7"], {
      isFollowing: false,
      stats: { followers: 3 },
    });

    const { result } = renderHook(() => useToggleFollow("7"), {
      wrapper: makeWrapper(qc),
    });

    act(() => {
      result.current.mutate({ isFollowing: false, viewerPetId: 4 });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = qc.getQueryData(["petProfile", "7"]);
    expect(cached.isFollowing).toBe(false);
    expect(cached.stats.followers).toBe(3);
  });
});
