// Contract for the E12 reengagement hooks: the query hits GET /api/pets/[id]/reengagement; the actions
// POST the right shape. fetch is mocked.

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useReengagement, useReengagementAction } from "./useReengagement";

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

describe("useReengagement", () => {
  it("returns the lapse status + welcome-back payload", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ lapsed: true, welcome_back: { friends: [], repair_available: true } }),
    });
    const { result } = renderHook(() => useReengagement(7), { wrapper: makeWrapper(makeClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.lapsed).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith("/api/pets/7/reengagement");
  });
});

describe("reengagement actions POST the right body", () => {
  const okJson = (body) => ({ ok: true, json: async () => body });

  it("repair sends { action:'repair' }", async () => {
    global.fetch.mockResolvedValue(okJson({ streak: { current: 10 } }));
    const { result } = renderHook(() => useReengagementAction(7), { wrapper: makeWrapper(makeClient()) });
    const res = await result.current.repair();
    expect(res.streak.current).toBe(10);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ action: "repair" });
  });

  it("optOut sends { action:'opt_out' }", async () => {
    global.fetch.mockResolvedValue(okJson({ opted_out: true }));
    const { result } = renderHook(() => useReengagementAction(7), { wrapper: makeWrapper(makeClient()) });
    await result.current.optOut();
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ action: "opt_out" });
  });

  it("markSeen sends { action:'seen' }", async () => {
    global.fetch.mockResolvedValue(okJson({ ok: true }));
    const { result } = renderHook(() => useReengagementAction(7), { wrapper: makeWrapper(makeClient()) });
    await result.current.markSeen();
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ action: "seen" });
  });
});
