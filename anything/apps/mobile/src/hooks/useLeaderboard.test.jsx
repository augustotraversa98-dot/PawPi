// Contract for the E8 leaderboard hooks: the list query reads the flavor-scoped board, and the
// area opt-in POSTs the coarse area (never a precise location). fetch is mocked; no network.

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLeaderboard, useSetLeaderboardArea } from "./useLeaderboard";

function makeWrapper(queryClient) {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}
function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

beforeEach(() => {
  global.fetch = jest.fn();
});
afterEach(() => jest.restoreAllMocks());

describe("useLeaderboard", () => {
  it("reads the flavor-scoped board", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ flavor: "friends", gated: false, board: [{ pet_id: 1, rank: 1, xp: 20 }] }),
    });
    const { result } = renderHook(() => useLeaderboard(7, "friends"), { wrapper: makeWrapper(makeClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.board).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledWith("/api/pets/7/leaderboard?flavor=friends");
  });
});

describe("useSetLeaderboardArea", () => {
  it("POSTs a coarse area opt-in", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, opt_in: true, area: "Palermo" }) });
    const { result } = renderHook(() => useSetLeaderboardArea(7), { wrapper: makeWrapper(makeClient()) });
    await result.current.mutateAsync({ optIn: true, area: "Palermo" });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/pets/7/leaderboard");
    expect(JSON.parse(opts.body)).toEqual({ action: "set_area", opt_in: true, area: "Palermo" });
  });
});
