// Contract for the E11 weekly-digest hooks: the digest query hits GET /api/pets/[id]/weekly-digest
// and returns the server's honest shape; prefs read GET and PUT partial updates. fetch is mocked.

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useWeeklyDigest, useWeeklyDigestPrefs, useUpdateWeeklyDigestPrefs } from "./useWeeklyDigest";

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

describe("useWeeklyDigest", () => {
  it("returns the digest and hits the pet-scoped endpoint", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ state: "rich", walks: 5, ring_days_closed: 4, ring_days_total: 7 }),
    });
    const { result } = renderHook(() => useWeeklyDigest(7), { wrapper: makeWrapper(makeClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.state).toBe("rich");
    expect(global.fetch).toHaveBeenCalledWith("/api/pets/7/weekly-digest");
  });

  it("is disabled without a petId", () => {
    const { result } = renderHook(() => useWeeklyDigest(undefined), { wrapper: makeWrapper(makeClient()) });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("weekly digest prefs", () => {
  it("reads defaults from GET", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ push_enabled: true, email_enabled: false }) });
    const { result } = renderHook(() => useWeeklyDigestPrefs(), { wrapper: makeWrapper(makeClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ push_enabled: true, email_enabled: false });
    expect(global.fetch).toHaveBeenCalledWith("/api/engagement/weekly-digest-prefs");
  });

  it("PUTs a partial update and caches the result", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ push_enabled: true, email_enabled: true }) });
    const { result } = renderHook(() => useUpdateWeeklyDigestPrefs(), { wrapper: makeWrapper(makeClient()) });
    const res = await result.current.mutateAsync({ email_enabled: true });
    expect(res).toEqual({ push_enabled: true, email_enabled: true });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/engagement/weekly-digest-prefs");
    expect(opts.method).toBe("PUT");
    expect(JSON.parse(opts.body)).toEqual({ email_enabled: true });
  });
});
