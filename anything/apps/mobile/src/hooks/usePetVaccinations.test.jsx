// Contract for the owner-facing vaccination history hook:
//   - usePetVaccinations keys on ["pet-vaccinations", petId], hits
//     /api/pet-vaccinations?petId=, returns the vaccinations[] array, throws on
//     !ok, and is disabled (no fetch) until a petId is provided.
// fetch is mocked; no network, no DB.

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePetVaccinations } from "./usePetVaccinations";

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
});

describe("usePetVaccinations", () => {
  test("fetches vaccinations for the given petId and returns the array", async () => {
    const vaccinations = [
      { id: 1, name: "Rabies", date_given: "2025-04-21" },
      { id: 2, name: "Distemper", date_given: "2025-01-10" },
    ];
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ vaccinations }),
    }));

    const client = makeClient();
    const { result } = renderHook(() => usePetVaccinations(7), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(lastFetchUrl()).toBe("/api/pet-vaccinations?petId=7");
    expect(result.current.data).toBe(vaccinations);
    // query key carries the petId so different pets don't share a cache entry
    expect(
      client.getQueryData(["pet-vaccinations", 7]),
    ).toBe(vaccinations);
  });

  test("is disabled (no fetch) until a petId is provided", async () => {
    global.fetch = jest.fn();

    const { result } = renderHook(() => usePetVaccinations(undefined), {
      wrapper: makeWrapper(makeClient()),
    });

    // enabled:false → stays idle, never fetches.
    expect(result.current.fetchStatus).toBe("idle");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("throws when the response is not ok", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));

    const { result } = renderHook(() => usePetVaccinations(7), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error.message).toMatch(
      /failed to fetch vaccinations/i,
    );
  });
});
