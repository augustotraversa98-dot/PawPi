// Record links in the app, with the real share sheet and the real hooks over a mocked fetch: nothing is selected and
// notes are off; a warning and an explicit consent come before creating; the address goes only to the phone's share
// sheet (never to the query cache, the screen or the console); one tap or two create one link; a link that is not the
// choice is never sent; links are listed with what they show and can be removed; an older server says not available.

import React from "react";
import { Alert, Share, TouchableOpacity } from "react-native";
import { render, fireEvent, waitFor, act, within } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ShareWithVetSheet from "./ShareWithVetSheet";
import RecordLinks from "./RecordLinks";
import { SHARE_SECTIONS } from "@/utils/vetShare";

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
const mockQuery = (data) => ({ data, isError: false, refetch: jest.fn() });
const mockBookings = mockQuery({ upcoming: [], past: [] });
const mockGrants = mockQuery([]);
jest.mock("@/hooks/useProviders", () => ({ useMyBookings: () => mockBookings }));
jest.mock("@/hooks/useCareAccessGrants", () => ({
  useCareAccessGrants: () => mockGrants,
  useShareRecord: () => ({ mutate: jest.fn(), isPending: false }),
  useUpdateGrant: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const FRAGMENT = "q".repeat(43);
const ADDRESS = `https://example.test/shared-record#${FRAGMENT}`;
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const DAY = 86_400_000;
const start = Date.now();
const link = (over) => ({
  id: 41,
  pet_id: 7,
  pet_name: "Luna",
  sections: ["vaccines"],
  allow_notes: false,
  status: "active",
  created_at: new Date(start).toISOString(),
  expires_at: new Date(start + 7 * DAY).toISOString(),
  ...over,
});
const created = (over) => reply({ link: link(over), url: ADDRESS }, 201);

let links;
let onList;
let onPost;
let onPatch;
let client;

beforeEach(() => {
  mockLangRef.current = "en";
  links = [];
  onList = () => reply({ available: true, links });
  onPost = () => created();
  onPatch = () => reply({ link: { id: 41, status: "revoked" } });
  global.fetch = jest.fn(async (url, init) => {
    if (init?.method === "POST") return onPost();
    if (init?.method === "PATCH") return onPatch();
    if (url.startsWith("/api/care-access/links")) return onList();
    return reply({ invites: [] });
  });
  jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
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
const writes = () =>
  global.fetch.mock.calls
    .filter(([, init]) => init?.method)
    .map(([url, init]) => [url, init.method, JSON.parse(init.body)]);
const press = (s, id) => fireEvent.press(s.getByTestId(id));
const state = (s, id) => s.getByTestId(id).props.accessibilityState;
const ctaDisabled = (s) => state(s, "cta").disabled;

async function toChoices() {
  const s = sheet();
  await waitFor(() => expect(s.getByTestId("record-link-start")).toBeTruthy());
  press(s, "record-link-start");
  return s;
}
async function toReview({ sections = ["vaccines"], expiry = "7d", notes = false } = {}) {
  const s = await toChoices();
  sections.forEach((k) => press(s, `record-link-section-${k}`));
  press(s, `record-link-expiry-${expiry}`);
  if (notes) press(s, "record-link-allow-notes");
  press(s, "cta");
  return s;
}
async function consentAndCreate(options) {
  const s = await toReview(options);
  press(s, "record-link-consent");
  press(s, "cta");
  return s;
}

test("nothing is selected, notes are off, and there is no 'until I revoke it'", async () => {
  const s = await toChoices();
  SHARE_SECTIONS.forEach((k) => expect(state(s, `record-link-section-${k}`).checked).toBe(false));
  for (const k of ["7d", "30d", "1y"]) expect(state(s, `record-link-expiry-${k}`).selected).toBe(false);
  expect(s.queryByTestId("record-link-expiry-until_revoked")).toBeNull();
  expect(state(s, "record-link-allow-notes").checked).toBe(false);
  expect(ctaDisabled(s)).toBe(true);
  press(s, "record-link-section-vaccines");
  expect(ctaDisabled(s)).toBe(true);
  press(s, "record-link-expiry-30d");
  expect(ctaDisabled(s)).toBe(false);
});

test("warns that anyone with the link can see it, and creates nothing before consent", async () => {
  const s = await toReview({ sections: ["files"] });
  expect(s.getByText(/Anyone who has this link can see these parts of Luna's record without signing in, until .* or until you remove it\./)).toBeTruthy();
  expect(s.getByText("View only: they can't add notes.")).toBeTruthy();
  expect(s.getByText(/Some files saved earlier are listed but can't be opened through a link/)).toBeTruthy();
  expect(state(s, "record-link-consent").checked).toBe(false);
  expect(ctaDisabled(s)).toBe(true);
  press(s, "cta");
  expect(writes()).toEqual([]);
});

test("says the warning in Spanish (voseo)", async () => {
  mockLangRef.current = "es";
  const s = await toReview({ notes: true });
  expect(s.getByText(/Cualquier persona que tenga este enlace puede ver estas partes de la historia de Luna sin iniciar sesión/)).toBeTruthy();
  expect(s.getByText(/aparece como “Cambios de alguien externo”/)).toBeTruthy();
  expect(s.getByText("Crear enlace y compartir")).toBeTruthy();
});

test("sends exactly the choice, hands the address to the share sheet, and keeps it nowhere", async () => {
  const spies = ["log", "info", "warn", "error", "debug"].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
  onPost = () => created({ sections: ["vaccines", "files"], allow_notes: true });
  const s = await consentAndCreate({ sections: ["files", "vaccines"], notes: true });
  await waitFor(() => expect(Share.share).toHaveBeenCalledTimes(1));
  expect(writes()).toEqual([
    ["/api/care-access/links", "POST", { petId: 7, sections: ["vaccines", "files"], expiry: "7d", allowNotes: true }],
  ]);
  const { message } = Share.share.mock.calls[0][0];
  expect(message).toContain("Luna");
  expect(message.endsWith(`\n${ADDRESS}`)).toBe(true);
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect(Alert.alert.mock.calls[0][0]).toBe("Link shared");
  const cached = JSON.stringify([
    client.getQueryCache().getAll().map((q) => [q.queryKey, q.state.data]),
    client.getMutationCache().getAll().map((m) => m.state),
  ]);
  expect(cached).not.toContain(FRAGMENT);
  expect(JSON.stringify(s.toJSON())).not.toContain(FRAGMENT);
  expect(JSON.stringify([spies.flatMap((spy) => spy.mock.calls), Alert.alert.mock.calls])).not.toContain(FRAGMENT);
});

test("tapping twice creates one link", async () => {
  let finish;
  onPost = () => new Promise((resolve) => (finish = resolve));
  const s = await toReview();
  press(s, "record-link-consent");
  // Two taps in the same frame, before React has redrawn the button as disabled, then a third one after.
  const onPress = s.UNSAFE_getAllByType(TouchableOpacity).find((n) => n.props.testID === "cta").props.onPress;
  act(() => {
    onPress();
    onPress();
  });
  press(s, "cta");
  await waitFor(() => expect(finish).toBeDefined());
  expect(writes()).toHaveLength(1);
  await act(async () => finish(created()));
  await waitFor(() => expect(Share.share).toHaveBeenCalledTimes(1));
});

test.each([
  ["more sections", { sections: ["vaccines", "files"] }],
  ["notes allowed", { allow_notes: true }],
  ["a longer end", { expires_at: new Date(start + 30 * DAY).toISOString() }],
])("a link with %s than chosen is removed and never sent", async (_name, over) => {
  onPost = () => created(over);
  await consentAndCreate();
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect(Share.share).not.toHaveBeenCalled();
  expect(writes()[1]).toEqual(["/api/care-access/links/41", "PATCH", { action: "revoke" }]);
  expect(Alert.alert.mock.calls[0][0]).toBe("Nothing was shared");
});

test("a share sheet closed without sending offers to remove the link", async () => {
  Share.share.mockResolvedValue({ action: Share.dismissedAction });
  await consentAndCreate();
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  const [title, , buttons] = Alert.alert.mock.calls[0];
  expect(title).toBe("The link wasn't sent");
  buttons.find((b) => b.text === "Remove link").onPress();
  await waitFor(() => expect(writes()).toContainEqual(["/api/care-access/links/41", "PATCH", { action: "revoke" }]));
});

test.each([
  ["a database without links", reply({ code: "share_links_unavailable" }, 409), "Not available yet"],
  ["an older server", reply({ error: "not_found" }, 404), "Not available yet"],
  ["the limit", reply({ code: "link_limit", limit: 10 }, 409), "Too many links"],
  ["the rate limit", reply({ code: "rate_limited" }, 429), "Try again later"],
  ["a dog that is not theirs", reply({ error: "Pet not found" }, 404), "No link was created"],
  ["a server error", reply({}, 500), "Couldn't create the link"],
])("explains %s, sends nothing and creates no other kind of link", async (_name, answer, title) => {
  onPost = () => answer;
  await consentAndCreate();
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect(Alert.alert.mock.calls[0][0]).toBe(title);
  expect(Share.share).not.toHaveBeenCalled();
  expect(writes().map(([url]) => url)).toEqual(["/api/care-access/links"]);
});

test.each([
  ["an older server", () => reply({ error: "not_found" }, 404)],
  ["a database without links", () => reply({ available: false, links: [] })],
])("%s: says sharing by link is not available, with no way to create one", async (_name, answer) => {
  onList = answer;
  const s = sheet();
  await waitFor(() => expect(s.getByTestId("record-links-unavailable")).toBeTruthy());
  expect(s.getByText("Sharing by link isn't available yet.")).toBeTruthy();
  expect(s.queryByTestId("record-link-start")).toBeNull();
  expect(writes()).toEqual([]);
});

test("lists each active link with its parts, end date and permission, and removes it after asking", async () => {
  links = [
    link({ id: 1, sections: ["files", "vaccines"], allow_notes: true }),
    link({ id: 2, pet_id: 8, pet_name: "Rex" }),
    link({ id: 3, status: "revoked" }),
    link({ id: 4, expires_at: new Date(start - DAY).toISOString() }),
  ];
  const s = wrap(<RecordLinks pet={pet} onCreate={jest.fn()} />);
  await waitFor(() => expect(s.getByTestId("record-link-row-1")).toBeTruthy());
  expect(s.getByTestId("record-link-row-2")).toBeTruthy();
  expect(s.queryByTestId("record-link-row-3")).toBeNull();
  expect(s.queryByTestId("record-link-row-4")).toBeNull();
  const first = within(s.getByTestId("record-link-row-1"));
  expect(first.getByText("Vaccinations")).toBeTruthy();
  expect(first.getByText("Documents")).toBeTruthy();
  expect(within(s.getByTestId("record-link-row-2")).queryByText("Documents")).toBeNull();
  expect(s.getByText("Can add vet notes")).toBeTruthy();
  expect(s.getByText("View only")).toBeTruthy();

  press(s, "record-link-remove-1");
  expect(Alert.alert.mock.calls[0][0]).toBe("Remove this link?");
  expect(writes()).toEqual([]);
  links = [];
  Alert.alert.mock.calls[0][2].find((b) => b.style === "destructive").onPress();
  await waitFor(() => expect(s.queryByTestId("record-link-row-1")).toBeNull());
  expect(writes()).toEqual([["/api/care-access/links/1", "PATCH", { action: "revoke" }]]);
});

test("without creating (Data access): only this dog's links, and nothing at all when there are none", async () => {
  links = [link({ id: 2, pet_id: 8, pet_name: "Rex" })];
  const none = wrap(<RecordLinks pet={pet} />);
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(none.queryByTestId("record-links")).toBeNull();
  links = [link({ id: 1 }), link({ id: 2, pet_id: 8 })];
  const some = wrap(<RecordLinks pet={pet} />);
  await waitFor(() => expect(some.getByTestId("record-link-row-1")).toBeTruthy());
  expect(some.queryByTestId("record-link-row-2")).toBeNull();
  expect(some.queryByTestId("record-link-start")).toBeNull();
});
