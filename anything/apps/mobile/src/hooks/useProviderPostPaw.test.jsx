// Contract for useToggleProviderPostPaw (business-post paws, ticket 2.94):
//   - paw (not yet pawed) → POST the paw route; un-paw → DELETE; optimistic count +/-1;
//   - reverts the optimistic cache on a failed request;
//   - reconciles with the server's authoritative { paw_count, is_pawed } on success.
// fetch is mocked; no network.

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useToggleProviderPostPaw,
  providerPostPawKey,
} from "./useProviderPostPaw";

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

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useToggleProviderPostPaw", () => {
  test("paws a not-yet-pawed post: POSTs, optimistic +1, reconciles with the server", async () => {
    const client = makeClient();
    client.setQueryData(providerPostPawKey("42", "9"), {
      paw_count: 2,
      is_pawed: false,
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ paw_count: 3, is_pawed: true }),
    }));

    const { result } = renderHook(() => useToggleProviderPostPaw("42", "9"), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ isPawed: false });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers/42/posts/9/paw",
      expect.objectContaining({ method: "POST" }),
    );
    expect(client.getQueryData(providerPostPawKey("42", "9"))).toEqual({
      paw_count: 3,
      is_pawed: true,
    });
  });

  test("un-paws a pawed post: DELETEs", async () => {
    const client = makeClient();
    client.setQueryData(providerPostPawKey("42", "9"), {
      paw_count: 3,
      is_pawed: true,
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ paw_count: 2, is_pawed: false }),
    }));

    const { result } = renderHook(() => useToggleProviderPostPaw("42", "9"), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ isPawed: true });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/providers/42/posts/9/paw",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(client.getQueryData(providerPostPawKey("42", "9"))).toEqual({
      paw_count: 2,
      is_pawed: false,
    });
  });

  test("reverts the optimistic update when the request fails", async () => {
    const client = makeClient();
    client.setQueryData(providerPostPawKey("42", "9"), {
      paw_count: 5,
      is_pawed: false,
    });
    global.fetch = jest.fn(async () => ({
      ok: false,
      json: async () => ({ error: "boom" }),
    }));

    const { result } = renderHook(() => useToggleProviderPostPaw("42", "9"), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ isPawed: false }).catch(() => {});
    });

    await waitFor(() =>
      expect(client.getQueryData(providerPostPawKey("42", "9"))).toEqual({
        paw_count: 5,
        is_pawed: false,
      }),
    );
  });
});
