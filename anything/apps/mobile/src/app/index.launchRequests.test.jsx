// Launch-request dedupe, part 1 — pets + providers.
//
// Before: the EntryPoint fetched GET /api/pets and GET /api/providers with raw fetches that never
// reached the React Query cache, so the moment the tabs mounted usePetProfile() fetched /api/pets a
// SECOND time and OwnerMenu's useMyProviders() fetched /api/providers a second time (and providers
// was fetched at launch even though it is only consulted for an account with no pets).
//
// Now: the EntryPoint reads through the shared cache (utils/launchQueries), so the consumers that
// mount right after find it fresh; providers is read only on the empty-pets branch.

import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";

// The redirect is what mounts the tabs, so the tabs' readers mount exactly when it renders — never
// alongside the EntryPoint's own reads.
jest.mock("expo-router", () => ({
  Redirect: ({ href }) => {
    const { Text } = require("react-native");
    return (
      <>
        <Text>{`redirect:${href}`}</Text>
        {mockMountTabs()}
      </>
    );
  },
  useRouter: () => ({ replace: jest.fn() }),
}));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("@/utils/auth/useAuth", () => ({ useAuth: () => mockAuth }));
jest.mock("../../__create/boot-trace", () => ({ markBootStep: jest.fn(), markBootComplete: jest.fn() }));
jest.mock("@/utils/notificationDeepLink", () => ({ markNavigationReady: jest.fn() }));
jest.mock("@/telemetry/startup", () => ({ reportStartup: jest.fn() }));
jest.mock("@/components/ui", () => ({ PawMark: () => null }));

import EntryPoint from "./index";
import { queryClient } from "@/utils/queryClient";
import { useCurrentPet } from "@/hooks/usePetProfile";
import { useMyProviders } from "@/hooks/useProviders";

let mockAuth;
const JWT = "eyJhbGciOiJkaXIifQ..abc-_1.def.ghi";
const json = (body) => ({ ok: true, status: 200, json: async () => body });

// What the tabs do right after the redirect: several components read the same pets/providers.
function mockMountTabs() {
  return <TabsReaders />;
}
function TabsReaders() {
  const { Text } = require("react-native");
  const { data: pet } = useCurrentPet();
  const { data: pet2 } = useCurrentPet(); // a second observer, as in the real tabs (~12 of them)
  return (
    <>
      <Text>{`pet:${pet?.name ?? "-"}/${pet2?.name ?? "-"}`}</Text>
      {/* OwnerMenu (More tab) reads providers — only mounted once that tab is first opened. */}
      {mockProvidersReaderMounted ? <ProvidersReader /> : null}
    </>
  );
}
function ProvidersReader() {
  const { Text } = require("react-native");
  const { data: providers } = useMyProviders();
  return <Text>{`providers:${providers ? providers.length : "-"}`}</Text>;
}
let mockProvidersReaderMounted = false;

function launch() {
  return render(
    <QueryClientProvider client={queryClient}>
      <EntryPoint />
    </QueryClientProvider>,
  );
}

const callsTo = (path) => global.fetch.mock.calls.filter(([url]) => String(url).split("?")[0] === path).length;

let pets;
let providers;
beforeEach(() => {
  mockProvidersReaderMounted = false;
  queryClient.clear();
  jest.spyOn(console, "log").mockImplementation(() => {});
  mockAuth = { isReady: true, auth: { jwt: JWT }, setAuth: jest.fn() };
  pets = [{ id: 7, name: "Mango" }];
  providers = [];
  global.fetch = jest.fn(async (url) => {
    if (url === "/api/pets") return json({ pets });
    if (url === "/api/providers") return json({ providers });
    return json({});
  });
});

test("an owner with a pet: /api/pets is fetched ONCE for the whole launch and /api/providers not at all", async () => {
  const screen = launch();
  await screen.findByText("redirect:/(tabs)");
  // The tabs' readers resolve from the cache EntryPoint filled.
  await waitFor(() => expect(screen.getByText("pet:Mango/Mango")).toBeTruthy());

  expect(callsTo("/api/pets")).toBe(1); // was 2 (EntryPoint + usePetProfile)
  expect(callsTo("/api/providers")).toBe(0); // was 1 at launch
});

test("no pets: providers is read once for the role check and the later useMyProviders shares it", async () => {
  pets = [];
  providers = [{ id: 3, name: "City Vets" }];
  mockProvidersReaderMounted = true; // the business home / More tab reading the same list
  const screen = launch();
  await screen.findByText("redirect:/business");
  await waitFor(() => expect(screen.getByText("providers:1")).toBeTruthy());

  expect(callsTo("/api/pets")).toBe(1);
  expect(callsTo("/api/providers")).toBe(1); // was 2
});

test("a failing providers read still never blocks onboarding", async () => {
  pets = [];
  global.fetch = jest.fn(async (url) => {
    if (url === "/api/pets") return json({ pets: [] });
    throw new Error("offline");
  });
  const screen = launch();
  await screen.findByText("redirect:/onboarding-photo");
});

test("scoping: a different user signing in is never served the previous user's cached pets", async () => {
  const first = launch();
  await first.findByText("redirect:/(tabs)");
  first.unmount();

  // identity change → the auth store clears the shared cache (utils/auth/store.js)
  queryClient.clear();
  mockAuth = { isReady: true, auth: { jwt: JWT.replace("abc", "zzz") }, setAuth: jest.fn() };
  pets = [{ id: 99, name: "Other" }];
  const second = launch();
  await second.findByText("redirect:/(tabs)");
  await waitFor(() => expect(second.getByText("pet:Other/Other")).toBeTruthy());
});
