import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Controllable session for each case. useUser imports useSession from the
// build-only @auth/create alias, so we mock it at the module boundary.
let mockSession = { data: null, status: "loading" };
vi.mock("@auth/create/react", () => ({
  useSession: () => mockSession,
}));

import useUser from "./useUser";

// These tests exercise the non-PRODUCTION (development) branch: the test env
// leaves NEXT_PUBLIC_CREATE_ENV unset, so `!== "PRODUCTION"` is true.
describe("useUser (development mode)", () => {
  beforeEach(() => {
    mockSession = { data: null, status: "loading" };
  });

  it("returns the LIVE session user once authenticated (not the stale null)", () => {
    mockSession = {
      data: { user: { id: "u1", email: "a@b.com" } },
      status: "authenticated",
    };
    const { result } = renderHook(() => useUser());
    expect(result.current.user).toEqual({ id: "u1", email: "a@b.com" });
    expect(result.current.loading).toBe(false);
  });

  it("returns null user while the session is still loading", () => {
    mockSession = { data: null, status: "loading" };
    const { result } = renderHook(() => useUser());
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it("returns null user when unauthenticated", () => {
    mockSession = { data: null, status: "unauthenticated" };
    const { result } = renderHook(() => useUser());
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
