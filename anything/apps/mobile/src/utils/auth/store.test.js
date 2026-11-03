// Guards the account-switch cache-bleed fix: every setAuth call (login, account
// switch, logout) must clear the React Query cache so one account's server data
// never bleeds into the next session.
import { useAuthStore } from "./store";
import { queryClient } from "@/utils/queryClient";
import { getCachedAuth, resetCachedAuthForTests } from "./tokenCache";

jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "afu",
}));

jest.mock("@/utils/queryClient", () => ({
  queryClient: { clear: jest.fn() },
}));

// The device cleanup itself is covered in sessionCleanup.test.js / logoutPaths.test.jsx; here we
// only assert WHEN setAuth triggers it.
jest.mock("./sessionCleanup", () => ({
  ...jest.requireActual("./sessionCleanup"),
  cleanUpAfterIdentityChange: jest.fn(() => Promise.resolve()),
}));
import { cleanUpAfterIdentityChange } from "./sessionCleanup";

describe("useAuthStore.setAuth", () => {
  beforeEach(() => {
    cleanUpAfterIdentityChange.mockClear();
    queryClient.clear.mockClear();
    useAuthStore.setState({ auth: null });
  });

  it("clears the query cache on login (account switch)", () => {
    useAuthStore.getState().setAuth({ jwt: "t", user: { id: 1 } });
    expect(queryClient.clear).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().auth).toMatchObject({ jwt: "t", user: { id: 1 } });
  });

  it("clears the query cache on logout", () => {
    useAuthStore.setState({ auth: { jwt: "t", user: { id: 1 } } });
    useAuthStore.getState().setAuth(null);
    expect(queryClient.clear).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().auth).toBeNull();
  });

  describe("device cleanup on identity change", () => {
    const A = { jwt: "jwt-A", user: { id: 1 } };
    const B = { jwt: "jwt-B", user: { id: 2 } };

    it("runs on logout, with the previous auth (its jwt is needed to unregister the push token)", () => {
      useAuthStore.setState({ auth: A });
      useAuthStore.getState().setAuth(null);
      expect(cleanUpAfterIdentityChange).toHaveBeenCalledTimes(1);
      expect(cleanUpAfterIdentityChange).toHaveBeenCalledWith(A);
    });

    it("runs when switching straight to a different user", () => {
      useAuthStore.setState({ auth: A });
      useAuthStore.getState().setAuth(B);
      expect(cleanUpAfterIdentityChange).toHaveBeenCalledWith(A);
      expect(useAuthStore.getState().auth).toMatchObject(B);
    });

    it("does not run on a first sign-in or a same-user token refresh", () => {
      useAuthStore.getState().setAuth(A);
      expect(cleanUpAfterIdentityChange).not.toHaveBeenCalled();
      useAuthStore.getState().setAuth({ jwt: "jwt-A2", user: { id: 1 } });
      expect(cleanUpAfterIdentityChange).not.toHaveBeenCalled();
    });

    it("runs BEFORE the stored jwt is dropped", () => {
      const SecureStore = require("expo-secure-store");
      SecureStore.deleteItemAsync.mockClear();
      cleanUpAfterIdentityChange.mockImplementationOnce(() => {
        expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
        return Promise.resolve();
      });
      useAuthStore.setState({ auth: A });
      useAuthStore.getState().setAuth(null);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
    });

    it("a throwing cleanup can never block the logout", () => {
      cleanUpAfterIdentityChange.mockImplementationOnce(() => {
        throw new Error("boom");
      });
      useAuthStore.setState({ auth: A });
      expect(() => useAuthStore.getState().setAuth(null)).not.toThrow();
      expect(useAuthStore.getState().auth).toBeNull();
    });
  });
});

describe("useAuthStore.applyRefreshedToken (rolling session refresh)", () => {
  const A = { jwt: "jwt-A.x.y", user: { id: 1 } };

  beforeEach(() => {
    cleanUpAfterIdentityChange.mockClear();
    queryClient.clear.mockClear();
    resetCachedAuthForTests();
    useAuthStore.setState({ auth: null });
    useAuthStore.getState().setAuth(A);
    queryClient.clear.mockClear();
  });

  it("swaps the jwt, keeps the user, stamps tokenAt, and moves the in-memory cache with it", () => {
    expect(useAuthStore.getState().applyRefreshedToken("jwt-A.x.y", "jwt-A2.x.y")).toBe(true);
    const auth = useAuthStore.getState().auth;
    expect(auth).toMatchObject({ jwt: "jwt-A2.x.y", user: { id: 1 } });
    expect(typeof auth.tokenAt).toBe("number");
    expect(getCachedAuth()).toEqual(auth);
  });

  it("keeps the React Query cache and runs no device cleanup (same user)", () => {
    useAuthStore.getState().applyRefreshedToken("jwt-A.x.y", "jwt-A2.x.y");
    expect(queryClient.clear).not.toHaveBeenCalled();
    expect(cleanUpAfterIdentityChange).not.toHaveBeenCalled();
  });

  it("refuses when the signed-in session is no longer the one that sent the request", () => {
    expect(useAuthStore.getState().applyRefreshedToken("some-other-jwt", "jwt-A2.x.y")).toBe(false);
    useAuthStore.getState().setAuth(null);
    expect(useAuthStore.getState().applyRefreshedToken("jwt-A.x.y", "jwt-A2.x.y")).toBe(false);
    expect(useAuthStore.getState().auth).toBeNull();
    expect(getCachedAuth()).toBeNull();
  });

  it("refuses a malformed or unchanged token", () => {
    expect(useAuthStore.getState().applyRefreshedToken("jwt-A.x.y", "bad token")).toBe(false);
    expect(useAuthStore.getState().applyRefreshedToken("jwt-A.x.y", "")).toBe(false);
    expect(useAuthStore.getState().applyRefreshedToken("jwt-A.x.y", "jwt-A.x.y")).toBe(false);
    expect(useAuthStore.getState().auth.jwt).toBe("jwt-A.x.y");
  });

  it("a normal sign-in still clears the cache; re-setting the same token keeps its tokenAt", () => {
    const stamped = useAuthStore.getState().auth;
    useAuthStore.getState().setAuth({ jwt: "jwt-A.x.y", user: { id: 1, name: "x" } });
    expect(useAuthStore.getState().auth.tokenAt).toBe(stamped.tokenAt);
    expect(queryClient.clear).toHaveBeenCalledTimes(1);
  });

  it("a session stored before tokenAt existed stays 'unknown' when the same token is re-set", () => {
    useAuthStore.setState({ auth: { jwt: "old.x.y", user: { id: 1 } } });
    useAuthStore.getState().setAuth({ jwt: "old.x.y", user: { id: 1, name: "n" } });
    expect(useAuthStore.getState().auth.tokenAt).toBeUndefined();
  });
});

// Perf audit 2026-10-23 (F1.6): the fetch wrapper serves the token from memory, so setAuth must keep that copy in
// lockstep with the Keychain: login / account switch replace it, logout marks "known signed out" (null).
describe("useAuthStore.setAuth keeps the in-memory session copy in sync", () => {
  beforeEach(() => {
    resetCachedAuthForTests();
    useAuthStore.setState({ auth: null });
  });

  it("login stores the new session", () => {
    useAuthStore.getState().setAuth({ jwt: "t1", user: { id: 1 } });
    expect(getCachedAuth()).toMatchObject({ jwt: "t1", user: { id: 1 } });
  });

  it("an account switch replaces it (A's token can never be sent as B)", () => {
    useAuthStore.getState().setAuth({ jwt: "tA", user: { id: 1 } });
    useAuthStore.getState().setAuth({ jwt: "tB", user: { id: 2 } });
    expect(getCachedAuth()).toMatchObject({ jwt: "tB", user: { id: 2 } });
  });

  it("logout marks the session as known-signed-out (null), not unknown", () => {
    useAuthStore.getState().setAuth({ jwt: "t1", user: { id: 1 } });
    useAuthStore.getState().setAuth(null);
    expect(getCachedAuth()).toBeNull();
  });
});
