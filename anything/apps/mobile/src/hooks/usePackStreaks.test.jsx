// Contract for the E7 pack-streak hooks: each action POSTs the right shape to
// /api/pets/[id]/pack-streaks, and the list query returns the pack_streaks array (empty on a
// degraded/pre-migration backend). fetch is mocked; no network.

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  usePackStreaks,
  useRequestPackStreak,
  useAcceptPackStreak,
  useBoopPackStreak,
} from "./usePackStreaks";

function makeWrapper(queryClient) {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}
function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

beforeEach(() => {
  global.fetch = jest.fn();
});
afterEach(() => jest.restoreAllMocks());

describe("usePackStreaks", () => {
  it("returns the pack_streaks array", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ pack_streaks: [{ id: 1, status: "active", current_count: 3 }] }),
    });
    const { result } = renderHook(() => usePackStreaks(7), { wrapper: makeWrapper(makeClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 1, status: "active", current_count: 3 }]);
    expect(global.fetch).toHaveBeenCalledWith("/api/pets/7/pack-streaks");
  });
});

describe("pack actions POST the right body", () => {
  const okJson = (body) => ({ ok: true, json: async () => body });

  it("request sends { action:'request', partner_handle }", async () => {
    global.fetch.mockResolvedValue(okJson({ ok: true, pack_id: 9 }));
    const { result } = renderHook(() => useRequestPackStreak(7), { wrapper: makeWrapper(makeClient()) });
    await result.current.request("bella-dog");
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/pets/7/pack-streaks");
    expect(JSON.parse(opts.body)).toEqual({ action: "request", partner_handle: "bella-dog" });
  });

  it("accept sends { action:'accept', pack_id }", async () => {
    global.fetch.mockResolvedValue(okJson({ ok: true }));
    const { result } = renderHook(() => useAcceptPackStreak(7), { wrapper: makeWrapper(makeClient()) });
    await result.current.accept(9);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ action: "accept", pack_id: 9 });
  });

  it("boop sends { action:'boop', pack_id } and returns the result", async () => {
    global.fetch.mockResolvedValue(okJson({ ok: true, result: "sent" }));
    const { result } = renderHook(() => useBoopPackStreak(7), { wrapper: makeWrapper(makeClient()) });
    const res = await result.current.boop(9);
    expect(res).toEqual({ ok: true, result: "sent" });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ action: "boop", pack_id: 9 });
  });

  it("surfaces a friendly error with status on a non-ok response", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "nope" }) });
    const { result } = renderHook(() => useRequestPackStreak(7), { wrapper: makeWrapper(makeClient()) });
    await expect(result.current.request("x")).rejects.toMatchObject({ status: 409 });
  });
});
