// Contract for the owner-facing care-access "trust" hooks:
//   - useCareAccessGrants keys on ["care-access-grants", petId], is disabled with
//     no petId, hits /api/care-access/grants?petId=, returns grants[], throws on
//     !ok;
//   - useUpdateGrant PATCHes /api/care-access/grants/[grantId] with {action,
//     expiresAt}, invalidates ["care-access-grants", petId] on success, and
//     surfaces the backend error message (e.g. a 409 illegal transition).
// fetch is mocked; no network, no DB.

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCareAccessGrants, useUpdateGrant } from "./useCareAccessGrants";

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

function lastFetchUrl() {
  const calls = global.fetch.mock.calls;
  return calls[calls.length - 1][0];
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useCareAccessGrants", () => {
  test("is disabled (no fetch) until a petId is provided", () => {
    global.fetch = jest.fn();

    const { result } = renderHook(() => useCareAccessGrants(undefined), {
      wrapper: makeWrapper(makeClient()),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("fetches grants for the pet (key incl petId, url has ?petId) and returns the array", async () => {
    const grants = [
      { id: 1, pet_id: 7, status: "pending", provider_name: "Happy Paws" },
    ];
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ grants }),
    }));

    const { result } = renderHook(() => useCareAccessGrants(7), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(lastFetchUrl()).toBe("/api/care-access/grants?petId=7");
    expect(result.current.data).toBe(grants);
  });

  test("throws when the response is not ok", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));

    const { result } = renderHook(() => useCareAccessGrants(7), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error.message).toMatch(/failed to fetch care access/i);
  });
});

describe("useUpdateGrant", () => {
  test.each(["approve", "deny", "revoke"])(
    "PATCHes the grant with action=%s and body {action, expiresAt}",
    async (action) => {
      global.fetch = jest.fn(async () => ({
        ok: true,
        json: async () => ({ grant: { id: 5, status: "active" } }),
      }));

      const { result } = renderHook(() => useUpdateGrant(7), {
        wrapper: makeWrapper(makeClient()),
      });

      await act(async () => {
        await result.current.mutateAsync({ grantId: 5, action });
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/care-access/grants/5",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ action, expiresAt: undefined }),
        }),
      );
    },
  );

  test("passes through an optional expiresAt on approve", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ grant: { id: 5 } }),
    }));

    const { result } = renderHook(() => useUpdateGrant(7), {
      wrapper: makeWrapper(makeClient()),
    });

    await act(async () => {
      await result.current.mutateAsync({
        grantId: 5,
        action: "approve",
        expiresAt: "2026-12-31",
      });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/care-access/grants/5",
      expect.objectContaining({
        body: JSON.stringify({ action: "approve", expiresAt: "2026-12-31" }),
      }),
    );
  });

  test("invalidates the pet-scoped grant key on success", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ grant: { id: 5 } }),
    }));

    const client = makeClient();
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useUpdateGrant(7), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ grantId: 5, action: "approve" });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["care-access-grants", 7],
    });
  });

  test("surfaces the backend error message on a 409 illegal transition", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: "Only a pending grant can be approved" }),
    }));

    const { result } = renderHook(() => useUpdateGrant(7), {
      wrapper: makeWrapper(makeClient()),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ grantId: 5, action: "approve" });
      }),
    ).rejects.toThrow(/only a pending grant can be approved/i);
  });
});
