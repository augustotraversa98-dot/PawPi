// Contract for the E14 household hooks: the query hits GET /api/household; the family-streak opt-in
// POSTs the right shape.
import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useHousehold, useFamilyStreakOptIn } from "./useHousehold";

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

test("fetches the household", async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ dogs: [], owned_count: 0 }) });
  const { result } = renderHook(() => useHousehold(), { wrapper: makeWrapper(makeClient()) });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(global.fetch).toHaveBeenCalledWith("/api/household");
});

test("optIn POSTs { action:'family_streak_opt_in' }", async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ opted_in: true }) });
  const { result } = renderHook(() => useFamilyStreakOptIn(), { wrapper: makeWrapper(makeClient()) });
  await result.current.optIn();
  expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ action: "family_streak_opt_in" });
});
