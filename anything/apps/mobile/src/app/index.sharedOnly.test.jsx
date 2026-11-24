// Family sharing: the launch gate for a partner who owns NO dog but has one SHARED with them. Real EntryPoint, real fetchPets / React Query
// cache; only the network and the router are faked. #747's launch-routing guarantees (new account → onboarding, owner → app) are re-asserted
// so this change cannot quietly weaken them.

import React from "react";
import { render, waitFor } from "@testing-library/react-native";

const mockSetAuth = jest.fn();
let mockAuth;

jest.mock("expo-router", () => ({
  Redirect: ({ href }) => {
    const { Text } = require("react-native");
    return <Text>{`redirect:${href}`}</Text>;
  },
  useRouter: () => ({ replace: jest.fn() }),
}));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("@react-native-async-storage/async-storage", () => ({ setItem: jest.fn(() => Promise.resolve()) }));
jest.mock("@/utils/auth/useAuth", () => ({ useAuth: () => mockAuth }));
jest.mock("../../__create/boot-trace", () => ({ markBootStep: jest.fn(), markBootComplete: jest.fn() }));
jest.mock("@/utils/notificationDeepLink", () => ({ markNavigationReady: jest.fn() }));
jest.mock("@/components/ui", () => ({ PawMark: () => null }));

import { queryClient } from "@/utils/queryClient";
import EntryPoint from "./index";

const json = (body) => ({ ok: true, status: 200, json: async () => body });
const GOOD = "eyJhbGciOiJkaXIifQ..abc-_1.def.ghi";

const own = { id: 1, name: "Mango", is_shared: false, access_role: "owner" };
const sharedFamily = {
  id: 7, name: "Luna", is_shared: true, access_role: "family", grant_id: 3,
  owner_display: { full_name: "Sam", username: "sam", avatar_url: null },
};
const sharedCaregiver = { ...sharedFamily, id: 8, access_role: "caregiver" };

let petsAnswer;
let providersAnswer;
beforeEach(() => {
  jest.clearAllMocks();
  queryClient.clear();
  mockAuth = { isReady: true, auth: { jwt: GOOD }, setAuth: mockSetAuth };
  providersAnswer = [];
  global.fetch = jest.fn((url) => {
    if (String(url).startsWith("/api/pets")) return Promise.resolve(json({ pets: petsAnswer, access_version: "v1" }));
    if (url === "/api/providers") return Promise.resolve(json({ providers: providersAnswer }));
    return Promise.resolve(json({}));
  });
});

const urls = () => global.fetch.mock.calls.map(([u]) => String(u));

test.each([
  ["family", [sharedFamily]],
  ["caregiver", [sharedCaregiver]],
])("a person whose ONLY dog is shared with them (%s) lands in the app, never in onboarding", async (_role, pets) => {
  petsAnswer = pets;
  const { findByText, queryByText } = render(<EntryPoint />);
  await findByText("redirect:/(tabs)");
  expect(queryByText("redirect:/onboarding-photo")).toBeNull();
  expect(urls()).toContain("/api/pets?include_shared=1");
  expect(urls()).not.toContain("/api/providers"); // has a dog: the business check is not even paid for
});

test("the launch read seeds the shared list into the ['pets'] cache (no second fetch for the tabs)", async () => {
  petsAnswer = [sharedFamily];
  const { findByText } = render(<EntryPoint />);
  await findByText("redirect:/(tabs)");
  expect(queryClient.getQueryData(["pets"])).toEqual([sharedFamily]);
});

test("an owner with own + shared dogs goes to the app", async () => {
  petsAnswer = [own, sharedFamily];
  const { findByText } = render(<EntryPoint />);
  await findByText("redirect:/(tabs)");
});

test("#747 guarantee: a brand-new account (no own, no shared dog) still reaches onboarding", async () => {
  petsAnswer = [];
  const { findByText } = render(<EntryPoint />);
  await findByText("redirect:/onboarding-photo");
});

test("#747 guarantee: a business-only account (no dog of any kind) still reaches Business home", async () => {
  petsAnswer = [];
  providersAnswer = [{ id: 5 }];
  const { findByText } = render(<EntryPoint />);
  await findByText("redirect:/business");
});

test("#747 guarantee: a transient empty read after the session knew a shared dog does not eject the person to onboarding", async () => {
  queryClient.setQueryData(["pets"], [sharedFamily]);
  petsAnswer = [];
  const { findByText, queryByText } = render(<EntryPoint />);
  await findByText("redirect:/(tabs)");
  await waitFor(() => expect(queryByText("redirect:/onboarding-photo")).toBeNull());
});
