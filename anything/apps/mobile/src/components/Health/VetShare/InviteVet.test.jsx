// Inviting a vet by link, with the real hooks over a mocked fetch: the rules are said before anything is created, the
// link goes only to the phone's share sheet (never to the query cache, the screen or the console), invites are listed
// with their state, an open one can be withdrawn, and the server's refusals are explained.

import React from "react";
import { Alert, Share } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import InviteVet from "./InviteVet";

const mockLangRef = { current: "en" };
jest.mock("react-i18next", () => ({
  useTranslation: () => require("@/i18n/testMock").makeReactI18nextMock(mockLangRef.current).useTranslation(),
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));

const LINK = "https://example.test/vet-invite#abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM0123";
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const created = reply({ invite: { id: 31, pet_id: 7, status: "open" }, link: LINK }, 201);
const invite = (over) => ({
  id: 31,
  pet_id: 7,
  pet_name: "Luna",
  status: "open",
  created_at: "2026-11-26T12:00:00Z",
  expires_at: "2026-12-03T12:00:00Z",
  used_by_provider_name: null,
  ...over,
});

let invites;
let onPost;
let onPatch;
let client;

beforeEach(() => {
  mockLangRef.current = "en";
  invites = [];
  onPost = () => created;
  onPatch = () => reply({ invite: { id: 31, status: "revoked" } });
  global.fetch = jest.fn(async (url, init) => {
    if (init?.method === "POST") return onPost();
    if (init?.method === "PATCH") return onPatch();
    return reply({ invites });
  });
  jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  client?.clear();
  jest.restoreAllMocks();
});

const open = () => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={client}>
      <InviteVet pet={{ id: 7, name: "Luna" }} />
    </QueryClientProvider>,
  );
};

const writes = () =>
  global.fetch.mock.calls
    .filter(([, init]) => init?.method)
    .map(([url, init]) => [url, init.method, JSON.parse(init.body)]);

test("says the rules before anything is created", async () => {
  const s = open();
  expect(s.getByText("The link works once, for 7 days.")).toBeTruthy();
  expect(s.getByText("Whoever opens it must have a vet business on PawPi.")).toBeTruthy();
  expect(s.getByText("Nothing in the record is shared until you approve their request.")).toBeTruthy();
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(writes()).toEqual([]);
  expect(Share.share).not.toHaveBeenCalled();
});

test("says the same rules in Spanish", () => {
  mockLangRef.current = "es";
  const s = open();
  expect(s.getByText("El enlace funciona una sola vez, durante 7 días.")).toBeTruthy();
  expect(s.getByText("Quien lo abra tiene que tener un negocio veterinario en PawPi.")).toBeTruthy();
  expect(s.getByText("No se comparte nada de la ficha hasta que apruebes su solicitud.")).toBeTruthy();
});

test("creates for this dog, hands the link to the share sheet, and keeps it nowhere", async () => {
  const spies = ["log", "info", "warn", "error", "debug"].map((m) =>
    jest.spyOn(console, m).mockImplementation(() => {}),
  );
  const s = open();
  invites = [invite()];
  fireEvent.press(s.getByTestId("vet-invite-create"));

  await waitFor(() => expect(Share.share).toHaveBeenCalledTimes(1));
  expect(writes()).toEqual([["/api/care-access/invites", "POST", { petId: 7 }]]);
  const { message } = Share.share.mock.calls[0][0];
  expect(message).toContain("Luna");
  expect(message).toContain("works once, for 7 days, and nothing is shared until I approve it");
  expect(message.endsWith(`\n${LINK}`)).toBe(true);

  await waitFor(() => expect(s.getByTestId("vet-invite-row-31")).toBeTruthy());
  const secret = LINK.split("#")[1];
  const cached = JSON.stringify([
    client.getQueryCache().getAll().map((q) => [q.queryKey, q.state.data]),
    client.getMutationCache().getAll().map((m) => m.state),
  ]);
  expect(cached).not.toContain(secret);
  expect(JSON.stringify(s.toJSON())).not.toContain(secret);
  expect(JSON.stringify(spies.flatMap((spy) => spy.mock.calls))).not.toContain(secret);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test.each([
  ["closed without sending", () => Share.share.mockResolvedValue({ action: Share.dismissedAction })],
  ["that failed to open", () => Share.share.mockRejectedValue(new Error("no share sheet"))],
])("a share sheet %s offers to withdraw the invite, since the link cannot be shown again", async (_n, arrange) => {
  arrange();
  const s = open();
  fireEvent.press(s.getByTestId("vet-invite-create"));

  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  const [title, body, buttons] = Alert.alert.mock.calls[0];
  expect(title).toBe("The link wasn't sent");
  expect(`${title}${body}`).not.toContain("vet-invite#");
  buttons.find((b) => b.text === "Withdraw invite").onPress();
  await waitFor(() =>
    expect(writes()).toContainEqual(["/api/care-access/invites/31", "PATCH", { action: "revoke" }]),
  );
});

test.each([
  [
    "the open-invite limit",
    reply({ code: "invite_limit", limit: 5 }, 409),
    "Too many open invites",
    "You can have up to 5 open invites across all your dogs. Withdraw one to create another.",
  ],
  ["the rate limit", reply({ code: "rate_limited" }, 429), "Try again later", /too many tries/],
  ["a dog that is not theirs", reply({ error: "Pet not found" }, 404), "No invite was created", /owner/],
  ["a server error", reply({}, 500), "Couldn't create the invite", /Nothing was shared/],
])("explains %s", async (_name, answer, title, body) => {
  onPost = () => answer;
  const s = open();
  fireEvent.press(s.getByTestId("vet-invite-create"));

  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect(Alert.alert.mock.calls[0][0]).toBe(title);
  expect(Alert.alert.mock.calls[0][1]).toMatch(body);
  expect(Share.share).not.toHaveBeenCalled();
});

test("lists every state, and only an open invite can be withdrawn", async () => {
  invites = [
    invite({ id: 1 }),
    invite({ id: 2, status: "used", used_by_provider_name: "North Clinic" }),
    invite({ id: 3, status: "revoked" }),
    invite({ id: 4, status: "expired", pet_name: "Rex" }),
  ];
  const s = open();

  await waitFor(() => expect(s.getByTestId("vet-invite-row-1")).toBeTruthy());
  expect(s.getByText(/^Open: works once, until .*2026$/)).toBeTruthy();
  expect(s.getByText("Used by North Clinic. You answer their request in Data access.")).toBeTruthy();
  expect(s.getByText("Withdrawn")).toBeTruthy();
  expect(s.getByText(/^Expired on .*2026$/)).toBeTruthy();
  expect(s.getByText(/^Rex · created/)).toBeTruthy();
  expect(s.getByTestId("vet-invite-withdraw-1")).toBeTruthy();
  for (const id of [2, 3, 4]) expect(s.queryByTestId(`vet-invite-withdraw-${id}`)).toBeNull();
});

test("withdrawing asks first", async () => {
  invites = [invite()];
  const s = open();
  await waitFor(() => expect(s.getByTestId("vet-invite-withdraw-31")).toBeTruthy());
  fireEvent.press(s.getByTestId("vet-invite-withdraw-31"));

  expect(Alert.alert.mock.calls[0][0]).toBe("Withdraw this invite?");
  expect(writes()).toEqual([]);
  invites = [invite({ status: "revoked" })];
  Alert.alert.mock.calls[0][2].find((b) => b.style === "destructive").onPress();

  await waitFor(() => expect(s.getByText("Withdrawn")).toBeTruthy());
  expect(writes()).toEqual([["/api/care-access/invites/31", "PATCH", { action: "revoke" }]]);
});

test.each([
  ["an invite already used", reply({ code: "invite_used" }, 409), "This invite was already used"],
  ["the rate limit", reply({ code: "rate_limited" }, 429), "Try again later"],
  ["a failure", reply({}, 500), "Couldn't withdraw the invite"],
])("withdrawing explains %s", async (_name, answer, title) => {
  invites = [invite()];
  onPatch = () => answer;
  const s = open();
  await waitFor(() => expect(s.getByTestId("vet-invite-withdraw-31")).toBeTruthy());
  fireEvent.press(s.getByTestId("vet-invite-withdraw-31"));
  Alert.alert.mock.calls[0][2].find((b) => b.style === "destructive").onPress();

  await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
  expect(Alert.alert.mock.calls[1][0]).toBe(title);
});

test("opening it again reads the invites again, even while the cached list still counts as fresh", async () => {
  invites = [invite()];
  const shared = new QueryClient({ defaultOptions: { queries: { staleTime: 300000, gcTime: Infinity } } });
  const mount = () => {
    client = shared;
    return render(
      <QueryClientProvider client={shared}>
        <InviteVet pet={{ id: 7, name: "Luna" }} />
      </QueryClientProvider>,
    );
  };
  const first = mount();
  await waitFor(() => expect(first.getByTestId("vet-invite-withdraw-31")).toBeTruthy());
  first.unmount();

  invites = [invite({ status: "used", used_by_provider_name: "North Clinic" })];
  const again = mount();
  await waitFor(() => expect(again.getByText(/^Used by North Clinic/)).toBeTruthy());
  expect(again.queryByTestId("vet-invite-withdraw-31")).toBeNull();
});

test("a list that cannot be loaded says so and retries", async () => {
  global.fetch.mockImplementationOnce(async () => reply({}, 500));
  const s = open();
  await waitFor(() => expect(s.getByText("Couldn't load your invites.")).toBeTruthy());
  invites = [invite()];
  fireEvent.press(s.getByText("Try again"));
  await waitFor(() => expect(s.getByTestId("vet-invite-row-31")).toBeTruthy());
});
