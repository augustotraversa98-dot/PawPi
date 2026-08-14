// Contract for the E15 life-stage hooks: the query hits GET /api/pets/[id]/life-stage; the override
// POSTs { life_stage } (null clears back to auto-detect).
import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLifeStage, useSetLifeStageOverride } from "./useLifeStage";

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

test("fetches the life stage for a pet", async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ detected: "senior", effective: "senior" }) });
  const { result } = renderHook(() => useLifeStage(7), { wrapper: makeWrapper(makeClient()) });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(global.fetch).toHaveBeenCalledWith("/api/pets/7/life-stage");
});

test("setOverride POSTs the chosen stage", async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ override: "adult" }) });
  const { result } = renderHook(() => useSetLifeStageOverride(7), { wrapper: makeWrapper(makeClient()) });
  await result.current.setOverride("adult");
  expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ life_stage: "adult" });
});

test("setOverride(null) clears back to auto-detect", async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ override: null }) });
  const { result } = renderHook(() => useSetLifeStageOverride(7), { wrapper: makeWrapper(makeClient()) });
  await result.current.setOverride(null);
  expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ life_stage: null });
});
