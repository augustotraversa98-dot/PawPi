// Contract for the mobile business-claim hooks (0125):
//   - useMyClaimForProvider hits GET /api/providers/:id/claim, returns the claim
//     object, or null on 404 (so the CTA can render "Reclamalo" vs "Solicitud
//     enviada" without a try/catch). Throws on any other non-ok status.
//   - useMyClaims hits GET /api/providers/claims/mine, returns the caller's array.
//   - useOpenClaim POSTs to /api/providers/:id/claim with body {method, note,
//     evidence}, invalidates the per-provider + mine keys on success, and surfaces
//     a structured error with .status + .claim_status on failure (so the modal can
//     render 409 already-claimed vs 404 not-found vs generic).
// fetch is mocked; no network.

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useMyClaimForProvider,
  useMyClaims,
  useOpenClaim,
} from "./useProviderClaims";

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

describe("useMyClaimForProvider", () => {
  test("is disabled until a provider id is known", async () => {
    global.fetch = jest.fn();
    const client = makeClient();
    const { result } = renderHook(() => useMyClaimForProvider(null), {
      wrapper: makeWrapper(client),
    });
    // enabled:false → never fires; fetch stays untouched.
    await new Promise((r) => setTimeout(r, 10));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  test("returns the claim object on 200", async () => {
    const claim = { id: 7, provider_id: 1000, status: "pending" };
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ claim }),
    }));
    const client = makeClient();
    const { result } = renderHook(() => useMyClaimForProvider(1000), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.data).toEqual(claim));
    expect(global.fetch).toHaveBeenCalledWith("/api/providers/1000/claim");
  });

  test("returns null on 404 (no claim yet) — the CTA rests on this contract", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: "Not found" }),
    }));
    const client = makeClient();
    const { result } = renderHook(() => useMyClaimForProvider(1000), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe("useMyClaims", () => {
  test("fetches the caller's claim list", async () => {
    const claims = [{ id: 1, provider_id: 1000, provider_name: "Clinic X" }];
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ claims }),
    }));
    const client = makeClient();
    const { result } = renderHook(() => useMyClaims(), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.data).toEqual(claims));
    expect(global.fetch).toHaveBeenCalledWith("/api/providers/claims/mine");
  });
});

describe("useOpenClaim", () => {
  test("POSTs to /api/providers/:id/claim with method + note + evidence", async () => {
    const claim = { id: 42, provider_id: 1000, status: "pending" };
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ claim }),
    }));
    const client = makeClient();
    const { result } = renderHook(() => useOpenClaim(), {
      wrapper: makeWrapper(client),
    });

    let returned;
    await act(async () => {
      returned = await result.current.mutateAsync({
        providerId: 1000,
        method: "phone",
        note: "hi",
      });
    });
    expect(returned).toEqual(claim);

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/providers/1000/claim");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({
      method: "phone",
      note: "hi",
      evidence: null,
    });
  });

  test("surfaces a structured error on 409 already-claimed", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({
        error: "This business has already been claimed.",
        claim_status: "claimed",
      }),
    }));
    const client = makeClient();
    const { result } = renderHook(() => useOpenClaim(), {
      wrapper: makeWrapper(client),
    });

    let caught;
    await act(async () => {
      try {
        await result.current.mutateAsync({ providerId: 1000 });
      } catch (err) {
        caught = err;
      }
    });
    expect(caught?.status).toBe(409);
    expect(caught?.claim_status).toBe("claimed");
    expect(caught?.message).toMatch(/already been claimed/i);
  });
});
