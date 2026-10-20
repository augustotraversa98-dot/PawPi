// A dead session (server answers a session_expired 401 on the startup fetch — e.g. a pre-#582 ghost
// Google token) must be CLEARED from the Keychain and land on Welcome, NOT the "couldn't reach PawPi" screen.
// Uses the REAL auth store (only expo-secure-store is faked) so this proves the Keychain item is
// actually deleted with the same key + options it was written under.

import React from "react";
import { render, waitFor } from "@testing-library/react-native";

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-router", () => ({
  Redirect: ({ href }) => {
    const { Text } = require("react-native");
    return <Text>{`redirect:${href}`}</Text>;
  },
  useRouter: () => ({ replace: jest.fn() }),
}));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("@react-native-async-storage/async-storage", () => ({ setItem: jest.fn() }));
jest.mock("../../__create/boot-trace", () => ({ markBootStep: jest.fn(), markBootComplete: jest.fn() }));
jest.mock("@/utils/notificationDeepLink", () => ({ markNavigationReady: jest.fn() }));
jest.mock("@/components/ui", () => ({ PawMark: () => null }));

import * as SecureStore from "expo-secure-store";
import { useAuthStore, authKey, secureStoreOptions } from "@/utils/auth/store";
import EntryPoint from "./index";

const GOOD = "eyJhbGciOiJkaXIifQ..abc-_1.def.ghi";

test("startup 401 deletes the Keychain token and lands on Welcome (not the network-error screen)", async () => {
  useAuthStore.setState({ isReady: true, auth: { jwt: GOOD } });
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      status: 401,
      headers: { get: (h) => (h.toLowerCase() === "x-pawpi-error-code" ? "session_expired" : null) },
      clone() { return this; },
      json: async () => ({ error: "expired", code: "session_expired" }),
    }),
  );

  const { findByText, queryByText } = render(<EntryPoint />);

  await findByText("redirect:/welcome");
  expect(queryByText("Try again")).toBeNull();
  await waitFor(() =>
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(authKey, secureStoreOptions),
  );
  expect(useAuthStore.getState().auth).toBeNull();
});

test("a BARE startup 401 (no session_expired code, re-check unavailable) keeps the token and shows the retry screen", async () => {
  SecureStore.deleteItemAsync.mockClear();
  useAuthStore.setState({ isReady: true, auth: { jwt: GOOD } });
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      status: 401,
      headers: { get: () => null },
      clone() { return this; },
      json: async () => ({ error: "Unauthorized" }),
    }),
  );

  const { findByText, queryByText } = render(<EntryPoint />);

  await findByText("Try again");
  expect(queryByText("redirect:/welcome")).toBeNull();
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  expect(useAuthStore.getState().auth).toEqual({ jwt: GOOD });
});
