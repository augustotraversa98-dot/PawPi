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

describe("useAuthStore.setAuth", () => {
  beforeEach(() => {
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
});
