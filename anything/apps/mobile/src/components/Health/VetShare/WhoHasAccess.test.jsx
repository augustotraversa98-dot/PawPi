// "Who has access" end to end, with the real My Hub, Data access and hooks over a mocked server: the number My Hub
// counts is always the number of entries Data access lists, whichever way the access was given or ended.

import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DataAccessScreen from "@/app/(tabs)/more/data-access";
import MyHubScreen from "@/app/(tabs)/more/hub";
import { useRevokeEmergencyLink } from "@/hooks/useEmergencyCard";
import { useRevokeGrant } from "@/hooks/usePetSharing";
import { refreshSharing } from "@/utils/sharingRefresh";

jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@/hooks/useBottomClearance", () => ({ __esModule: true, default: () => 0 }));
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
const mockQuery = (data) => ({ data, isLoading: false, isError: false, refetch: jest.fn() });
const mockPet = mockQuery({ id: 7, name: "Luna", is_shared: false });
const mockBookings = mockQuery({ upcoming: [], past: [] });
const mockNone = mockQuery([]);
jest.mock("@/hooks/usePetProfile", () => ({ useCurrentPet: () => mockPet }));
jest.mock("@/hooks/useProviders", () => ({
  useMyBookings: () => mockBookings,
  useAdoptionFavorites: () => mockNone,
  useFollowedProviders: () => mockNone,
}));

const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

const vetGrant = {
  id: 1, pet_id: 7, pet_name: "Luna", provider_id: 3, provider_name: "North Clinic", status: "active",
  scopes: ["record_sections"], sections: ["vaccines"], expires_at: null,
};
const recordLink = {
  id: 1, pet_id: 8, pet_name: "Rex", sections: ["files"], allow_notes: false, status: "active",
  created_at: new Date().toISOString(), expires_at: future,
};
const emergencyLink = { id: 1, pet_id: 8, pet_name: "Rex", scope: "full", expires_at: null };
const familyGrant = { id: 1, pet_id: 7, pet_name: "Luna", role: "family", grantee_username: "maria", expires_at: null };

// The server: one state behind every list, as the real routes read one database.
let server;
let client;

beforeEach(() => {
  server = { grants: [], links: [], emergency: [], family: [], oldServer: false, hold: false };
  global.fetch = jest.fn(async (url, init) => {
    if (init?.method === "PATCH" && url.startsWith("/api/care-access/grants/")) {
      const [grant] = server.grants;
      server.grants = [];
      return reply({ grant: { ...grant, status: "revoked", pet_name: undefined, provider_name: undefined } });
    }
    if (init?.method === "PATCH" && url.startsWith("/api/care-access/links/")) {
      server.links = [];
      return reply({ link: { id: 1, status: "revoked" } });
    }
    if (init?.method === "DELETE") {
      if (url.startsWith("/api/emergency-card/links/")) server.emergency = [];
      if (url.startsWith("/api/pet-caregivers/")) server.family = [];
      return reply({ ok: true });
    }
    if (server.hold) return new Promise(() => {});
    if (url.startsWith("/api/care-access/who-has-access")) {
      if (server.oldServer) return reply({ error: "not_found" }, 404);
      return reply({
        entries: [
          ...server.grants.map((g) => ({ ...g, kind: "vet" })),
          ...server.links.map((l) => ({ ...l, kind: "record_link" })),
          ...server.emergency.map((l) => ({ ...l, kind: "emergency_link" })),
          ...server.family.map((g) => ({ ...g, kind: "family" })),
        ],
      });
    }
    if (url.startsWith("/api/care-access/grants")) {
      const pet = url.split("petId=")[1];
      return reply({ grants: server.grants.filter((g) => !pet || String(g.pet_id) === pet) });
    }
    if (url.startsWith("/api/care-access/links")) return reply({ available: true, links: server.links });
    if (url.startsWith("/api/care-access/offers")) return reply({ available: true, offers: [] });
    return reply({ invites: [] });
  });
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 300_000 } } });
});
afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

// Family and emergency card links are ended on their own screens, through these hooks.
let ownScreens;
function OwnScreens() {
  ownScreens = {
    emergency: useRevokeEmergencyLink(8),
    family: useRevokeGrant(7),
  };
  return null;
}

const wrap = (node) => render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
function open() {
  const hub = wrap(<MyHubScreen />);
  const detail = wrap(
    <>
      <DataAccessScreen />
      <OwnScreens />
    </>,
  );
  return { hub, detail };
}

// Every way the detail list offers to end or manage one entry.
const listed = (detail) =>
  detail.queryAllByTestId(/^(data-access-revoke|record-link-remove|access-manage-(emergency_link|family))-\d+$/)
    .filter((n) => typeof n.type === "string").length;

async function expectBoth({ hub, detail }, count) {
  await waitFor(() => {
    expect(listed(detail)).toBe(count);
    if (count === 0) {
      expect(hub.getByText("No one has access to your pets.")).toBeTruthy();
      expect(detail.getByText("No one has access yet.")).toBeTruthy();
    } else {
      expect(hub.queryByText("No one has access to your pets.")).toBeNull();
      expect(hub.getByTestId("hub-access-count").props.children).toBe(count);
    }
  });
}

const reread = () => act(async () => { await refreshSharing(client); });

describe.each([
  ["a vet", "grants", vetGrant, "North Clinic"],
  ["a record link", "links", recordLink, "Link anyone can open"],
  ["an emergency card link", "emergency", emergencyLink, "Emergency card link"],
  ["a family member", "family", familyGrant, "@maria"],
])("shared with %s only", (_name, source, row, title) => {
  test("My Hub counts one and Data access lists it", async () => {
    server[source] = [row];
    const screens = open();
    await expectBoth(screens, 1);
    expect(screens.hub.getByText(title)).toBeTruthy();
    expect(screens.detail.getByText(title)).toBeTruthy();
  });
});

test("adding one way after another, then ending them, keeps the count and the list equal", async () => {
  const screens = open();
  await expectBoth(screens, 0);

  const ways = [["grants", vetGrant], ["links", recordLink], ["emergency", emergencyLink], ["family", familyGrant]];
  for (const [index, [source, row]] of ways.entries()) {
    server[source] = [row];
    await reread();
    await expectBoth(screens, index + 1);
  }

  // Nothing is read again from here on: each ending shows from its own confirmation.
  server.hold = true;
  const press = async (testID) => {
    fireEvent.press(screens.detail.getByTestId(testID));
    const [, , buttons] = Alert.alert.mock.calls.at(-1);
    await act(async () => buttons.find((b) => b.style === "destructive").onPress());
  };
  await press("data-access-revoke-1");
  await expectBoth(screens, 3);
  await press("record-link-remove-1");
  await expectBoth(screens, 2);
  await act(async () => { ownScreens.emergency.mutate(1); });
  await expectBoth(screens, 1);
  await act(async () => { ownScreens.family.mutate(1); });
  await expectBoth(screens, 0);
});

test("an access past its end date is neither counted nor listed", async () => {
  server.grants = [vetGrant];
  server.links = [{ ...recordLink, expires_at: new Date(Date.now() - 1000).toISOString() }];
  await expectBoth(open(), 1);
});

test("a server without the single list: vet access and record links still agree, and the rest is pointed out", async () => {
  server.oldServer = true;
  server.grants = [vetGrant, { ...vetGrant, id: 2, status: "pending", provider_id: 4 }];
  server.links = [recordLink];
  const screens = open();
  await waitFor(() => expect(screens.hub.getByTestId("hub-access-count").props.children).toBe(2));
  expect(screens.detail.getByTestId("data-access-revoke-1")).toBeTruthy();
  expect(screens.detail.getByTestId("record-link-remove-1")).toBeTruthy();
  expect(screens.detail.getByTestId("who-has-access-partial")).toBeTruthy();
});
