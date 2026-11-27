// Inviting a vet found by search, with the real share sheet and the real hooks over a mocked fetch: the search is
// offered only by a server that can invite; a picked vet goes through the same sections, length, review and consent;
// the invitation is sent once and nothing is shared directly; a business that already has access or asked for it is
// shared with directly; a different invitation already waiting is replaced only on request; waiting invitations are
// listed with Withdraw.

import React from "react";
import { Alert, TouchableOpacity } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ShareWithVetSheet from "./ShareWithVetSheet";
import ShareOffers from "./ShareOffers";

const mockLangRef = { current: "en" };
jest.mock("react-i18next", () => ({
  useTranslation: () => require("@/i18n/testMock").makeReactI18nextMock(mockLangRef.current).useTranslation(),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("@/components/KeyboardSafeFormModal", () => {
  const { View, Text, TouchableOpacity } = require("react-native");
  return {
    __esModule: true,
    default: ({ children, ctaLabel, ctaDisabled, onCtaPress }) => (
      <View>
        {children}
        <TouchableOpacity testID="cta" accessibilityState={{ disabled: !!ctaDisabled }} disabled={ctaDisabled} onPress={onCtaPress}>
          <Text>{ctaLabel}</Text>
        </TouchableOpacity>
      </View>
    ),
  };
});
// The link blocks have their own tests.
jest.mock("./RecordLinks", () => ({ __esModule: true, default: () => null }));
jest.mock("./InviteVet", () => ({ __esModule: true, default: () => null }));
jest.mock("./useRecordLinkSteps", () => ({ __esModule: true, default: () => ({ step: null, start: jest.fn() }) }));
const mockQuery = (data) => ({ data, isError: false, refetch: jest.fn() });
const mockBookings = mockQuery({ upcoming: [], past: [] });
let mockGrants;
const mockShare = jest.fn();
jest.mock("@/hooks/useProviders", () => ({ useMyBookings: () => mockBookings }));
jest.mock("@/hooks/useCareAccessGrants", () => ({
  useCareAccessGrants: () => mockGrants,
  useShareRecord: () => ({ mutate: mockShare, isPending: false }),
  useUpdateGrant: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const vet = { id: 3, name: "North Clinic", handle: "north-clinic", location_name: "Centro", address: "Calle 1" };
const offer = (over) => ({
  id: 51,
  pet_id: 7,
  pet_name: "Luna",
  provider_id: 3,
  provider_name: "North Clinic",
  sections: ["vaccines"],
  expiry: "30d",
  status: "open",
  created_at: new Date().toISOString(),
  lapses_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  ...over,
});

let offers;
let onSearch;
let onPost;
let onPatch;
let client;

beforeEach(() => {
  mockLangRef.current = "en";
  mockGrants = mockQuery([]);
  mockShare.mockReset();
  offers = [];
  onSearch = (q) => reply({ available: true, vets: q ? [vet] : [] });
  onPost = () => reply({ offer: offer() }, 201);
  onPatch = () => reply({ offer: { id: 51, status: "withdrawn" } });
  global.fetch = jest.fn(async (url, init) => {
    if (init?.method === "POST") return onPost();
    if (init?.method === "PATCH") return onPatch();
    if (url.startsWith("/api/care-access/vets")) return onSearch(decodeURIComponent(url.split("q=")[1] ?? ""));
    return reply({ available: true, offers });
  });
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => {
  client?.clear();
  jest.restoreAllMocks();
});

const wrap = (node) => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
};
const pet = { id: 7, name: "Luna", is_shared: false };
const sheet = () => wrap(<ShareWithVetSheet pet={pet} onClose={jest.fn()} onOpenRequests={jest.fn()} />);
const press = (s, id) => fireEvent.press(s.getByTestId(id));
const writes = () =>
  global.fetch.mock.calls
    .filter(([, init]) => init?.method)
    .map(([url, init]) => [url, init.method, JSON.parse(init.body)]);
const searches = () => global.fetch.mock.calls.map(([url]) => url).filter((u) => u.startsWith("/api/care-access/vets"));

async function pickVet() {
  const s = sheet();
  await waitFor(() => expect(s.getByTestId("vet-search-input")).toBeTruthy());
  fireEvent.changeText(s.getByTestId("vet-search-input"), "north");
  await waitFor(() => expect(s.getByTestId("vet-search-result-3")).toBeTruthy(), { timeout: 3000 });
  press(s, "vet-search-result-3");
  return s;
}
async function toReview({ expiry = "30d" } = {}) {
  const s = await pickVet();
  press(s, "vet-share-section-vaccines");
  press(s, `vet-share-expiry-${expiry}`);
  press(s, "cta");
  return s;
}
async function send(options) {
  const s = await toReview(options);
  press(s, "vet-share-consent");
  press(s, "cta");
  return s;
}

test("searches once typing pauses, from two characters", async () => {
  const s = sheet();
  await waitFor(() => expect(s.getByTestId("vet-search-input")).toBeTruthy());
  for (const value of ["n", "no", "nor", "north "]) fireEvent.changeText(s.getByTestId("vet-search-input"), value);
  await waitFor(() => expect(s.getByTestId("vet-search-result-3")).toBeTruthy(), { timeout: 3000 });
  expect(searches()).toEqual(["/api/care-access/vets?q=", "/api/care-access/vets?q=north"]);
  expect(s.getByText("Centro · Calle 1")).toBeTruthy();
  expect(s.getByTestId("vet-search-result-3").props.accessibilityState.selected).toBe(false);
});

test("says when nothing matches", async () => {
  onSearch = () => reply({ available: true, vets: [] });
  const s = sheet();
  await waitFor(() => expect(s.getByTestId("vet-search-input")).toBeTruthy());
  fireEvent.changeText(s.getByTestId("vet-search-input"), "zzz");
  await waitFor(() => expect(s.getByTestId("vet-search-empty")).toBeTruthy(), { timeout: 3000 });
});

test.each([
  ["an older server", () => reply({ error: "not_found" }, 404)],
  ["a database without invitations", () => reply({ available: false, vets: [] })],
])("%s: no search step", async (_name, answer) => {
  onSearch = answer;
  const s = sheet();
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(s.queryByTestId("vet-search")).toBeNull();
  expect(writes()).toEqual([]);
});

test("the review says it is an invitation: nothing visible until accepted, and no end date yet", async () => {
  const s = await toReview();
  expect(s.getByText("Everyone on North Clinic's PawPi team, only after they accept")).toBeTruthy();
  expect(s.getByText("For 30 days, starting when they accept")).toBeTruthy();
  expect(s.getByTestId("vet-share-review-invitation")).toBeTruthy();
  expect(s.getByText(/Before sending, check that “North Clinic” is really your vet/)).toBeTruthy();
  expect(s.getByText("Send invitation")).toBeTruthy();
  expect(s.getByTestId("cta").props.accessibilityState.disabled).toBe(true);
  press(s, "cta");
  expect(writes()).toEqual([]);
});

test("says it in Spanish (voseo)", async () => {
  mockLangRef.current = "es";
  const s = await toReview({ expiry: "until_revoked" });
  expect(s.getByText("Desde que acepte, hasta que lo revoques")).toBeTruthy();
  expect(s.getByText(/Acepto invitar a North Clinic/)).toBeTruthy();
  expect(s.getByText("Enviar invitación")).toBeTruthy();
});

test("sends the invitation with exactly the choice, shares nothing directly and makes no link", async () => {
  await send();
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect(writes()).toEqual([
    ["/api/care-access/offers", "POST", { petId: 7, providerId: 3, sections: ["vaccines"], expiry: "30d" }],
  ]);
  expect(Alert.alert.mock.calls[0][0]).toBe("Invitation sent");
  expect(mockShare).not.toHaveBeenCalled();
});

test("tapping twice sends one invitation", async () => {
  let finish;
  onPost = () => new Promise((resolve) => (finish = resolve));
  const s = await toReview();
  press(s, "vet-share-consent");
  const onPress = s.UNSAFE_getAllByType(TouchableOpacity).find((n) => n.props.testID === "cta").props.onPress;
  act(() => {
    onPress();
    onPress();
  });
  press(s, "cta");
  await waitFor(() => expect(finish).toBeDefined());
  expect(writes()).toHaveLength(1);
  await act(async () => finish(reply({ offer: offer() }, 201)));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
});

test("an answer that does not show the chosen invitation is not reported as sent", async () => {
  onPost = () => reply({ offer: offer({ sections: ["vaccines", "files"] }) }, 201);
  await send();
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect(Alert.alert.mock.calls[0][0]).toBe("Couldn't confirm the invitation");
});

test("the same invitation already waiting says so", async () => {
  onPost = () => reply({ offer: offer(), deduped: true });
  await send();
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect(Alert.alert.mock.calls[0][0]).toBe("Already waiting");
});

test("a different one waiting is replaced only when the owner says so", async () => {
  onPost = () => reply({ code: "offer_open", offer: offer({ id: 40, expiry: "7d" }) }, 409);
  await send();
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect(Alert.alert.mock.calls[0][0]).toBe("An invitation is already waiting");
  expect(writes()).toHaveLength(1);
  onPost = () => reply({ offer: offer() }, 201);
  Alert.alert.mock.calls[0][2].find((b) => b.text === "Replace it").onPress();
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
  expect(writes().slice(1).map(([url, method]) => [url, method])).toEqual([
    ["/api/care-access/offers/40", "PATCH"],
    ["/api/care-access/offers", "POST"],
  ]);
  expect(Alert.alert.mock.calls[1][0]).toBe("Invitation sent");
});

test.each([
  ["a database without invitations", reply({ code: "share_offers_unavailable" }, 409), "Not available yet"],
  ["the limit", reply({ code: "offer_limit", limit: 20 }, 409), "Too many invitations"],
  ["the rate limit", reply({ code: "rate_limited" }, 429), "Try again later"],
  ["a business that cannot be invited", reply({ error: "Provider not found" }, 404), "Nothing was sent"],
  ["a server error", reply({}, 500), "Couldn't confirm the invitation"],
])("explains %s", async (_name, answer, title) => {
  onPost = () => answer;
  await send();
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect(Alert.alert.mock.calls[0][0]).toBe(title);
  expect(mockShare).not.toHaveBeenCalled();
});

test.each([
  ["already has access", "active"],
  ["asked for access", "pending"],
])("a found business that %s is shared with directly, as before", async (_name, status) => {
  mockGrants = mockQuery([{ id: 4, provider_id: 3, status, scopes: ["record_sections"], sections: ["vaccines"], expires_at: null }]);
  const s = await toReview();
  expect(s.queryByTestId("vet-share-review-invitation")).toBeNull();
  press(s, "vet-share-consent");
  press(s, "cta");
  expect(mockShare).toHaveBeenCalledTimes(1);
  expect(mockShare.mock.calls[0][0]).toMatchObject({ providerId: 3, sections: ["vaccines"], expiry: "30d" });
  expect(writes()).toEqual([]);
});

test("lists this dog's waiting invitations and withdraws one after asking", async () => {
  offers = [
    offer(),
    offer({ id: 52, pet_id: 8 }),
    offer({ id: 53, status: "declined" }),
    offer({ id: 54, lapses_at: new Date(Date.now() - 1000).toISOString() }),
  ];
  const s = wrap(<ShareOffers pet={pet} />);
  await waitFor(() => expect(s.getByTestId("share-offer-row-51")).toBeTruthy());
  for (const id of [52, 53, 54]) expect(s.queryByTestId(`share-offer-row-${id}`)).toBeNull();
  expect(s.getByText("For: 30 days")).toBeTruthy();
  press(s, "share-offer-withdraw-51");
  expect(writes()).toEqual([]);
  offers = [];
  Alert.alert.mock.calls[0][2].find((b) => b.style === "destructive").onPress();
  await waitFor(() => expect(s.queryByTestId("share-offers")).toBeNull());
  expect(writes()).toEqual([["/api/care-access/offers/51", "PATCH", { action: "withdraw" }]]);
});

test("withdrawing one already accepted says to revoke instead", async () => {
  offers = [offer()];
  onPatch = () => reply({ code: "offer_accepted" }, 409);
  const s = wrap(<ShareOffers pet={pet} />);
  await waitFor(() => expect(s.getByTestId("share-offer-row-51")).toBeTruthy());
  press(s, "share-offer-withdraw-51");
  Alert.alert.mock.calls[0][2].find((b) => b.style === "destructive").onPress();
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
  expect(Alert.alert.mock.calls[1][1]).toBe("They already accepted it. Revoke their access instead.");
});
