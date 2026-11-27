// Business mode: invitations to see a record, with the real hooks over a mocked fetch. Only business-facing basics are
// shown before answering; accept and decline answer once; refusals are explained.

import React from "react";
import { Alert, TouchableOpacity } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BusinessShareOffersScreen from "./share-offers";

const mockLangRef = { current: "en" };
jest.mock("react-i18next", () => ({
  useTranslation: () => require("@/i18n/testMock").makeReactI18nextMock(mockLangRef.current).useTranslation(),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), canGoBack: () => true }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/hooks/useBottomClearance", () => () => 0);
jest.mock("@/components/RefreshableScrollView", () => {
  const { View } = require("react-native");
  return { RefreshableScrollView: ({ children }) => <View>{children}</View> };
});
jest.mock("@/hooks/useActiveProvider", () => ({
  useActiveProvider: () => ({ activeProvider: { id: 3, name: "North Clinic" } }),
}));

const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const offer = (over) => ({
  id: 51,
  pet_name: "Luna",
  owner_name: "Olivia",
  sections: ["vaccines", "vet_notes"],
  expiry: "7d",
  created_at: "2026-11-26T12:00:00Z",
  lapses_at: "2026-12-03T12:00:00Z",
  ...over,
});

let offers;
let onList;
let onPost;
let client;

beforeEach(() => {
  mockLangRef.current = "en";
  offers = [offer()];
  onList = () => reply({ available: true, offers });
  onPost = () => {
    offers = [];
    return reply({ status: "accepted", pet_id: 7, pet_name: "Luna" });
  };
  global.fetch = jest.fn(async (url, init) => (init?.method === "POST" ? onPost() : onList()));
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
      <BusinessShareOffersScreen />
    </QueryClientProvider>,
  );
};
const writes = () =>
  global.fetch.mock.calls.filter(([, init]) => init?.method).map(([url, init]) => [url, JSON.parse(init.body)]);

test("shows the pet, the owner, the parts, how long and the date to answer by", async () => {
  const s = open();
  await waitFor(() => expect(s.getByTestId("business-share-offer-51")).toBeTruthy());
  expect(global.fetch.mock.calls[0][0]).toBe("/api/providers/3/share-offers");
  expect(s.getByText("Luna")).toBeTruthy();
  expect(s.getByText("From Olivia")).toBeTruthy();
  expect(s.getByText("• Vaccinations")).toBeTruthy();
  expect(s.getByText("• Vet notes")).toBeTruthy();
  expect(s.getByText("For 7 days, from when you accept")).toBeTruthy();
  expect(s.getByText(/^Answer before .*2026$/)).toBeTruthy();
});

test.each([
  ["accept", "accepted", "Invitation accepted", /web provider area, under Clinical/],
  ["decline", "declined", "Invitation declined", /Nothing was shared/],
])("%s answers once, also on a double tap", async (action, status, title, body) => {
  let finish;
  onPost = () => new Promise((resolve) => (finish = resolve));
  const s = open();
  await waitFor(() => expect(s.getByTestId(`business-share-${action}-51`)).toBeTruthy());
  const control = s
    .UNSAFE_getAllByType(TouchableOpacity)
    .find((n) => n.props.testID === `business-share-${action}-51`);
  act(() => {
    control.props.onPress();
    control.props.onPress();
  });
  await waitFor(() => expect(finish).toBeDefined());
  expect(writes()).toEqual([["/api/providers/3/share-offers/51", { action }]]);
  offers = [];
  await act(async () => finish(reply({ status, pet_name: "Luna" })));
  await waitFor(() => expect(s.getByTestId("business-share-empty")).toBeTruthy());
  expect(Alert.alert.mock.calls[0][0]).toBe(title);
  expect(Alert.alert.mock.calls[0][1]).toMatch(body);
});

test.each([
  [reply({ code: "offer_not_open" }, 409), "This invitation is no longer waiting."],
  [reply({ code: "not_eligible" }, 409), "Only a published vet business can accept this invitation."],
])("explains a refused answer", async (answer, message) => {
  onPost = () => answer;
  const s = open();
  await waitFor(() => expect(s.getByTestId("business-share-accept-51")).toBeTruthy());
  fireEvent.press(s.getByTestId("business-share-accept-51"));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  expect(Alert.alert.mock.calls[0][1]).toBe(message);
});

test.each([
  ["none waiting", () => reply({ available: true, offers: [] }), "No invitations are waiting."],
  ["an older server", () => reply({ error: "not_found" }, 404), "Record invitations aren't available yet."],
  ["a database without invitations", () => reply({ available: false, offers: [] }), "Record invitations aren't available yet."],
  ["a failure", () => reply({}, 500), "Couldn't load the invitations."],
])("says so with %s", async (_name, answer, message) => {
  onList = answer;
  const s = open();
  await waitFor(() => expect(s.getByText(message)).toBeTruthy());
});

test("speaks Spanish (voseo)", async () => {
  mockLangRef.current = "es";
  offers = [offer({ owner_name: null, expiry: "until_revoked" })];
  const s = open();
  await waitFor(() => expect(s.getByText("De un dueño")).toBeTruthy());
  expect(s.getByText("Desde que aceptes, hasta que el dueño lo termine")).toBeTruthy();
  expect(s.getByText("Aceptar")).toBeTruthy();
});

describe("what the business will be able to add", () => {
  test("is listed before accepting", async () => {
    offers = [offer({ edit_sections: ["lab_results", "vet_notes"] })];
    const s = open();
    await waitFor(() => expect(s.getByTestId("business-share-adds-51")).toBeTruthy());
    expect(s.getByText("You'll be able to add to:")).toBeTruthy();
    expect(s.getByText("• Vet notes, and edit the ones added this way")).toBeTruthy();
    expect(s.getByText("• Lab results")).toBeTruthy();
    expect(s.getByText("You won't be able to delete anything.")).toBeTruthy();
    expect(s.queryByText("• Documents")).toBeNull();
    expect(writes()).toEqual([]);
  });

  test("is said to be nothing for a view-only invitation", async () => {
    offers = [offer({ edit_sections: [] })];
    const s = open();
    await waitFor(() => expect(s.getByText("View only: you won't be able to add anything.")).toBeTruthy());
  });

  test("is not mentioned by a server that cannot let a vet add anything", async () => {
    const s = open();
    await waitFor(() => expect(s.getByTestId("business-share-offer-51")).toBeTruthy());
    expect(s.queryByTestId("business-share-adds-51")).toBeNull();
    expect(s.queryByText(/able to add/)).toBeNull();
  });
});
