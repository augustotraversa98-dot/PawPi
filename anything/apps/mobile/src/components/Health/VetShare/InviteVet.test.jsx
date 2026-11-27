// The owner's earlier invite links, with the real hooks over a mocked fetch: they are listed with their state, an open
// one can be withdrawn, the server's refusals are explained, and nothing new can be created from here.

import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import InviteVet from "./InviteVet";

const mockLangRef = { current: "en" };
jest.mock("react-i18next", () => ({
  useTranslation: () => require("@/i18n/testMock").makeReactI18nextMock(mockLangRef.current).useTranslation(),
}));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));

const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
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
let onPatch;
let client;

beforeEach(() => {
  mockLangRef.current = "en";
  invites = [];
  onPatch = () => reply({ invite: { id: 31, status: "revoked" } });
  global.fetch = jest.fn(async (url, init) => {
    if (init?.method === "PATCH") return onPatch();
    return reply({ invites });
  });
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
      <InviteVet />
    </QueryClientProvider>,
  );
};

const writes = () =>
  global.fetch.mock.calls
    .filter(([, init]) => init?.method)
    .map(([url, init]) => [url, init.method, JSON.parse(init.body)]);

test("shows nothing, and creates nothing, when there are no earlier invites", async () => {
  const s = open();
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(s.queryByTestId("vet-invite")).toBeNull();
  expect(writes()).toEqual([]);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test("heads the list in Spanish", async () => {
  mockLangRef.current = "es";
  invites = [invite()];
  const s = open();
  await waitFor(() => expect(s.getByText("Tus invitaciones anteriores")).toBeTruthy());
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
        <InviteVet />
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
