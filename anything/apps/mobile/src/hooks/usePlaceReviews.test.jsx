// Contract for the place detail + review hooks (PawPi's OWN data, never Google):
//   - usePlaceDetail keys on ["place-detail", id], disabled with no id, GETs /api/places/[id],
//     returns place, throws on !ok;
//   - usePlaceReviews keys on ["place-reviews", id], disabled with no id, GETs the reviews route,
//     returns { reviews, aggregates } verbatim;
//   - useSubmitPlaceReview POSTs the reviews route with the two-dimension body (incl amenities),
//     invalidates ["place-reviews", id] on success, and surfaces the backend error message;
//   - useMyProfileId GETs /api/user-profile and returns profile.id.
// fetch is mocked; no network, no DB.

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  usePlaceDetail,
  usePlaceReviews,
  useSubmitPlaceReview,
} from "./usePlaceReviews";
import { useMyProfileId } from "./useUserProfile";

function makeWrapper(queryClient) {
  return function Wrapper({ children }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
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

function lastFetch() {
  const calls = global.fetch.mock.calls;
  return calls[calls.length - 1];
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("usePlaceDetail", () => {
  test("is disabled (no fetch) until an id is provided", () => {
    global.fetch = jest.fn();
    const { result } = renderHook(() => usePlaceDetail(undefined), {
      wrapper: makeWrapper(makeClient()),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("GETs /api/places/[id] and returns the place", async () => {
    const place = { id: "curated-x", name: "Cafe X", category: "cafe" };
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ place }) }));

    const { result } = renderHook(() => usePlaceDetail("curated-x"), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastFetch()[0]).toBe("/api/places/curated-x");
    expect(result.current.data).toEqual(place);
  });

  test("throws when the response is not ok", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
    const { result } = renderHook(() => usePlaceDetail("curated-x"), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error.message).toMatch(/failed to load place/i);
  });
});

describe("usePlaceReviews", () => {
  test("is disabled until an id is provided", () => {
    global.fetch = jest.fn();
    const { result } = renderHook(() => usePlaceReviews(""), {
      wrapper: makeWrapper(makeClient()),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("GETs the reviews route and returns { reviews, aggregates } verbatim", async () => {
    const payload = {
      reviews: [{ id: 1, overall_rating: 5, pet_welcome_level: "royalty" }],
      aggregates: { overall_avg: 5, overall_count: 1 },
    };
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => payload }));

    const { result } = renderHook(() => usePlaceReviews("curated-x"), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastFetch()[0]).toBe("/api/places/curated-x/reviews");
    expect(result.current.data).toEqual(payload);
  });
});

describe("useSubmitPlaceReview", () => {
  test("POSTs the two-dimension body (incl amenities) to the reviews route", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ review: { id: 9 } }),
    }));

    const { result } = renderHook(() => useSubmitPlaceReview("curated-x"), {
      wrapper: makeWrapper(makeClient()),
    });

    const body = {
      overall_rating: 4,
      pet_welcome_level: "very_welcoming",
      amenities: ["water_bowls", "treats"],
      comment: "Lovely",
      place_name: "Cafe X",
      place_category: "cafe",
    };
    await act(async () => {
      await result.current.mutateAsync(body);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/places/curated-x/reviews",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  });

  test("invalidates ['place-reviews', id] on success", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ review: { id: 9 } }),
    }));
    const client = makeClient();
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useSubmitPlaceReview("curated-x"), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        overall_rating: 5,
        pet_welcome_level: "royalty",
        amenities: [],
        place_name: "Cafe X",
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["place-reviews", "curated-x"],
    });
  });

  test("surfaces the backend error message on failure", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      json: async () => ({ error: "overall_rating is required and must be an integer from 1 to 5" }),
    }));

    const { result } = renderHook(() => useSubmitPlaceReview("curated-x"), {
      wrapper: makeWrapper(makeClient()),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ place_name: "Cafe X" });
      }),
    ).rejects.toThrow(/overall_rating is required/i);
  });
});

describe("useMyProfileId", () => {
  test("GETs /api/user-profile and returns profile.id", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ profile: { id: 42, username: "me" } }),
    }));

    const { result } = renderHook(() => useMyProfileId(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastFetch()[0]).toBe("/api/user-profile");
    expect(result.current.data).toBe(42);
  });
});
