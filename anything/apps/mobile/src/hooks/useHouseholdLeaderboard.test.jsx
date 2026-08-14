// Contract for the E13 PR3 household-leaderboard hooks: the query hits the pet-scoped endpoint; the
// owner-only opt-out POSTs the right shape.
import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useHouseholdLeaderboard, useHouseholdLeaderboardOptOut } from "./useHouseholdLeaderboard";

function makeWrapper(queryClient) {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}
function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => jest.restoreAllMocks());

test("fetches the household board for a pet", async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ members: [], most_active_user_id: null }) });
  const { result } = renderHook(() => useHouseholdLeaderboard(7), { wrapper: makeWrapper(makeClient()) });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(global.fetch).toHaveBeenCalledWith("/api/pets/7/household-leaderboard");
});

test("optOut POSTs { action:'opt_out' }", async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ opted_out: true }) });
  const { result } = renderHook(() => useHouseholdLeaderboardOptOut(7), { wrapper: makeWrapper(makeClient()) });
  await result.current.optOut();
  expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ action: "opt_out" });
});
