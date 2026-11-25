// Delete account — Option B (docs/delete-account-contributions-options.md; App Store 5.1.1(v)).
//   • the "also delete my posts" switch exists ONLY for a person who is a member of a dog that is not their own, defaults OFF,
//   • its hint follows the switch,
//   • OFF sends the request exactly as before (no query string), ON adds delete_contributions=1,
//   • the owner sentence shows ONLY to the owner of a dog that is shared with others, with the dog's real name(s),
//   • if the app cannot tell, the switch is hidden (never guessed) and deletion still works,
//   • a failed deletion shows the friendly sentence, nothing technical.

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: mockReplace }) }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock());
const mockSetAuth = jest.fn();
jest.mock("@/utils/auth/useAuth", () => ({ useAuth: () => ({ setAuth: mockSetAuth }) }));
jest.mock("@/i18n/localePreference", () => ({
  getLocalePreference: jest.fn().mockResolvedValue("en"),
  setLocalePreference: jest.fn(),
}));
jest.mock("@/components/Health/WalkActivity/WalkTrackingSettings", () => () => null);
jest.mock("@/utils/accountStorage", () => ({ clearAccountStorage: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/telemetry/navExpect", () => ({ markExpectedNavigation: jest.fn() }));

import AppSettings from "./AppSettings";

const en = require("@/i18n/locales/en.json");

const own = (id, name) => ({ id, name, is_shared: false, access_role: "owner" });
const shared = (id, name, role = "family") => ({ id, name, is_shared: true, access_role: role });

// Routes the app's reads: pets list, per-dog grants, and the deletion itself.
function mockNetwork({ pets, grants = {}, petsOk = true, deleteOk = true }) {
  const calls = [];
  global.fetch = jest.fn(async (url, init) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    if (u.startsWith("/api/pets")) {
      return petsOk ? { ok: true, json: async () => ({ pets }) } : { ok: false, status: 500, json: async () => ({}) };
    }
    if (u.startsWith("/api/pet-caregivers?petId=")) {
      const id = Number(u.split("=")[1]);
      return { ok: true, json: async () => ({ grants: grants[id] ?? [] }) };
    }
    if (u.startsWith("/api/account")) {
      return deleteOk ? { ok: true, json: async () => ({ ok: true }) } : { ok: false, status: 500, json: async () => ({ error: "Failed to delete account" }) };
    }
    return { ok: true, json: async () => ({}) };
  });
  return calls;
}

async function openConfirm(utils) {
  fireEvent.press(utils.getByTestId("delete-account"));
  await waitFor(() => expect(utils.getByTestId("delete-account-modal")).toBeTruthy());
}

let alertSpy;
beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const accountCalls = (calls) => calls.filter((c) => c.url.startsWith("/api/account"));
// Presses "Delete forever" in the second (native) confirmation.
async function pressDeleteForever() {
  const [title, , buttons] = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
  expect(title).toBe(en.settings.deletePermanentTitle);
  await buttons.find((b) => b.text === en.settings.deleteForever).onPress();
}

describe("the switch is shown only to a member of someone else's dog", () => {
  it("member: switch visible, default OFF, hint (off) shown", async () => {
    mockNetwork({ pets: [own(1, "Rex"), shared(2, "Luna")] });
    const u = render(<AppSettings />);
    await openConfirm(u);
    const sw = u.getByTestId("delete-contributions-switch");
    expect(sw.props.value).toBe(false);
    expect(u.getByText(en.settings.deleteContributionsLabel)).toBeTruthy();
    expect(u.getByText(en.settings.deleteContributionsHintOff)).toBeTruthy();
    expect(u.queryByText(en.settings.deleteContributionsHintOn)).toBeNull();
  });

  it("caregiver-only member (no dog of their own) also sees it", async () => {
    mockNetwork({ pets: [shared(2, "Luna", "caregiver")] });
    const u = render(<AppSettings />);
    await openConfirm(u);
    expect(u.getByTestId("delete-contributions-switch")).toBeTruthy();
  });

  it("owner who never joined anyone's dog: no switch", async () => {
    mockNetwork({ pets: [own(1, "Rex")] });
    const u = render(<AppSettings />);
    await openConfirm(u);
    expect(u.queryByTestId("delete-contributions-switch")).toBeNull();
    expect(u.queryByText(en.settings.deleteContributionsLabel)).toBeNull();
  });

  it("person with no dogs at all: no switch", async () => {
    mockNetwork({ pets: [] });
    const u = render(<AppSettings />);
    await openConfirm(u);
    expect(u.queryByTestId("delete-contributions-switch")).toBeNull();
  });

  it("pets list cannot be read: the switch is hidden (never guessed) and deletion is still offered", async () => {
    mockNetwork({ pets: [], petsOk: false });
    const u = render(<AppSettings />);
    await openConfirm(u);
    expect(u.queryByTestId("delete-contributions-switch")).toBeNull();
    expect(u.getByTestId("delete-account-confirm")).toBeTruthy();
  });

  it("switching it on swaps the hint", async () => {
    mockNetwork({ pets: [shared(2, "Luna")] });
    const u = render(<AppSettings />);
    await openConfirm(u);
    fireEvent(u.getByTestId("delete-contributions-switch"), "valueChange", true);
    expect(u.getByText(en.settings.deleteContributionsHintOn)).toBeTruthy();
    expect(u.queryByText(en.settings.deleteContributionsHintOff)).toBeNull();
  });
});

describe("the request that is sent", () => {
  it("switch OFF → DELETE /api/account exactly as before (no query string, no body)", async () => {
    const calls = mockNetwork({ pets: [shared(2, "Luna")] });
    const u = render(<AppSettings />);
    await openConfirm(u);
    fireEvent.press(u.getByTestId("delete-account-confirm"));
    await pressDeleteForever();
    const sent = accountCalls(calls);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("/api/account");
    expect(sent[0].init).toEqual({ method: "DELETE" });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/welcome"));
  });

  it("switch ON → DELETE /api/account?delete_contributions=1", async () => {
    const calls = mockNetwork({ pets: [shared(2, "Luna")] });
    const u = render(<AppSettings />);
    await openConfirm(u);
    fireEvent(u.getByTestId("delete-contributions-switch"), "valueChange", true);
    fireEvent.press(u.getByTestId("delete-account-confirm"));
    await pressDeleteForever();
    const sent = accountCalls(calls);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("/api/account?delete_contributions=1");
    expect(sent[0].init).toEqual({ method: "DELETE" });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/welcome"));
  });

  it("no one is deleted until the second confirmation is accepted", async () => {
    const calls = mockNetwork({ pets: [shared(2, "Luna")] });
    const u = render(<AppSettings />);
    await openConfirm(u);
    fireEvent.press(u.getByTestId("delete-account-confirm"));
    expect(accountCalls(calls)).toHaveLength(0);
  });

  it("reopening the dialog starts from OFF again", async () => {
    mockNetwork({ pets: [shared(2, "Luna")] });
    const u = render(<AppSettings />);
    await openConfirm(u);
    fireEvent(u.getByTestId("delete-contributions-switch"), "valueChange", true);
    fireEvent.press(u.getByTestId("delete-account-cancel"));
    await openConfirm(u);
    expect(u.getByTestId("delete-contributions-switch").props.value).toBe(false);
  });

  it("failure → the friendly sentence only, and the person stays signed in", async () => {
    mockNetwork({ pets: [shared(2, "Luna")], deleteOk: false });
    const u = render(<AppSettings />);
    await openConfirm(u);
    fireEvent.press(u.getByTestId("delete-account-confirm"));
    await pressDeleteForever();
    await waitFor(() =>
      expect(alertSpy).toHaveBeenLastCalledWith(en.settings.deleteErrorTitle, "Could not save. Please try again."),
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockSetAuth).not.toHaveBeenCalled();
  });
});

describe("the owner sentence", () => {
  const active = [{ id: 9, status: "active", is_expired: false }];

  it("owner of one shared dog: sentence with the real name", async () => {
    mockNetwork({ pets: [own(1, "Rex")], grants: { 1: active } });
    const u = render(<AppSettings />);
    await openConfirm(u);
    expect(u.getByTestId("delete-account-owner-sentence").props.children).toBe(
      "Rex is shared with others. Deleting your account also deletes Rex for them, with everything they added.",
    );
    expect(u.queryByTestId("delete-contributions-switch")).toBeNull();
  });

  it("owner of several shared dogs: lists the names, skips the unshared one", async () => {
    mockNetwork({
      pets: [own(1, "Rex"), own(2, "Luna"), own(3, "Mia"), own(4, "Solo")],
      grants: { 1: active, 2: active, 3: active, 4: [] },
    });
    const u = render(<AppSettings />);
    await openConfirm(u);
    const text = u.getByTestId("delete-account-owner-sentence").props.children;
    expect(text).toContain("Rex, Luna and Mia are shared with others.");
    expect(text).not.toContain("Solo");
  });

  it("owner whose dog has only a pending invite, a revoked, or an expired grant: no sentence", async () => {
    mockNetwork({
      pets: [own(1, "Rex")],
      grants: { 1: [{ status: "pending" }, { status: "revoked" }, { status: "expired", is_expired: true }, { status: "active", is_expired: true }] },
    });
    const u = render(<AppSettings />);
    await openConfirm(u);
    expect(u.queryByTestId("delete-account-owner-sentence")).toBeNull();
  });

  it("a member does not get the owner sentence for the dog shared with them", async () => {
    mockNetwork({ pets: [shared(2, "Luna")], grants: { 2: active } });
    const u = render(<AppSettings />);
    await openConfirm(u);
    expect(u.queryByTestId("delete-account-owner-sentence")).toBeNull();
  });

  it("someone who is both owner of a shared dog and a member elsewhere sees both", async () => {
    mockNetwork({ pets: [own(1, "Rex"), shared(2, "Luna")], grants: { 1: active } });
    const u = render(<AppSettings />);
    await openConfirm(u);
    expect(u.getByTestId("delete-account-owner-sentence")).toBeTruthy();
    expect(u.getByTestId("delete-contributions-switch")).toBeTruthy();
  });

  it("a grants read that fails shows no sentence (no guess) and deletion still works", async () => {
    mockNetwork({ pets: [own(1, "Rex")] });
    const base = global.fetch;
    global.fetch = jest.fn(async (url, init) =>
      String(url).startsWith("/api/pet-caregivers") ? { ok: false, status: 500, json: async () => ({}) } : base(url, init),
    );
    const u = render(<AppSettings />);
    await openConfirm(u);
    expect(u.queryByTestId("delete-account-owner-sentence")).toBeNull();
    expect(u.getByTestId("delete-account-confirm")).toBeTruthy();
  });
});

describe("copy never over-promises", () => {
  it("the confirmation body is the Option B body, not 'all your … data'", async () => {
    mockNetwork({ pets: [] });
    const u = render(<AppSettings />);
    await openConfirm(u);
    expect(u.getByText("This permanently deletes your account, your dogs and their records. This cannot be undone.")).toBeTruthy();
    for (const k of ["deleteAccountBody", "deleteAccountHint", "deletePermanentBody", "deleteContributionsHintOff", "deleteContributionsHintOn"]) {
      expect(en.settings[k]).not.toMatch(/all your|all data|photo/i);
    }
  });
});
