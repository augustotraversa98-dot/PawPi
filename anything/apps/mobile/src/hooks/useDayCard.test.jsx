// Contract for the E13 PR2 day-card hook: hits GET /api/pets/[id]/day-card with the optional ?day=.
import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDayCard } from "./useDayCard";

function makeWrapper(queryClient) {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}
function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => jest.restoreAllMocks());

test("fetches the day card for a pet and day", async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ slides: [], author_count: 0 }) });
  const { result } = renderHook(() => useDayCard(7, "2026-08-13"), { wrapper: makeWrapper(makeClient()) });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(global.fetch).toHaveBeenCalledWith("/api/pets/7/day-card?day=2026-08-13");
});

test("omits the query string when no day is given", async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ slides: [] }) });
  const { result } = renderHook(() => useDayCard(7), { wrapper: makeWrapper(makeClient()) });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(global.fetch).toHaveBeenCalledWith("/api/pets/7/day-card");
});
