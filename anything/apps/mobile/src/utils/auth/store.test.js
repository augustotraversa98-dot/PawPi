// Guards the account-switch cache-bleed fix: every setAuth call (login, account
// switch, logout) must clear the React Query cache so one account's server data
// never bleeds into the next session.
import { useAuthStore } from "./store";
import { queryClient } from "@/utils/queryClient";

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
    expect(useAuthStore.getState().auth).toEqual({ jwt: "t", user: { id: 1 } });
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
      expect(useAuthStore.getState().auth).toEqual(B);
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
