// Invite codes on the phone (PR6): the owner creates / shares / cancels; a person joins with a code, from the sharing
// screen or from onboarding. EN + ES. The code is never logged.
import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Alert, Share } from "react-native";
import i18n from "@/i18n";

const mockRouter = { replace: jest.fn(), push: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));

import InviteCodePanel from "./InviteCodePanel";
import RedeemInviteCard from "./RedeemInviteCard";
import HaveInviteCodeLink from "@/components/onboarding/HaveInviteCodeLink";
import useSelectedPetStore from "@/store/selectedPetStore";

const CODE = "ABCD-EFGH-JKMN";
let qc;
let alertSpy;
let logs;
let routes;
const wrap = (ui) => render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });

beforeEach(async () => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  mockRouter.replace.mockClear();
  mockRouter.push.mockClear();
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  logs = [];
  for (const level of ["log", "warn", "error", "info"]) {
    jest.spyOn(console, level).mockImplementation((...args) => logs.push(args.join(" ")));
  }
  routes = {
    "GET /api/pet-invite-codes?petId=1": reply(200, { invites: [] }),
    "POST /api/pet-invite-codes": reply(201, { code: CODE, invite: { id: 3, role: "family" } }),
  };
  global.fetch = jest.fn(async (url, options) => routes[`${options?.method ?? "GET"} ${url}`] ?? reply(500, {}));
  await i18n.changeLanguage("en");
});
afterEach(() => {
  qc.clear();
  jest.restoreAllMocks();
});

describe("owner", () => {
  const panel = () => wrap(<InviteCodePanel petId={1} petName="Rex" role="family" />);

  test("creates a code for this dog and role, shows it once and shares it with the instructions", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({});
    const screen = panel();
    await act(async () => fireEvent.press(screen.getByTestId("invite-code-create")));
    await waitFor(() => expect(screen.getByTestId("invite-code-value").props.children).toBe(CODE));
    const post = global.fetch.mock.calls.find(([, o]) => o?.method === "POST");
    expect(JSON.parse(post[1].body)).toEqual({ petId: 1, role: "family" });
    await act(async () => fireEvent.press(screen.getByTestId("invite-code-share")));
    const { message } = share.mock.calls[0][0];
    expect(message).toContain(CODE);
    expect(message).toContain("Rex");
    expect(message).toContain(`pawpi://pet-sharing?code=${CODE}`);
    expect(logs.join("\n")).not.toContain("ABCD");
  });

  test("waiting codes can be cancelled (and are never shown again)", async () => {
    routes["GET /api/pet-invite-codes?petId=1"] = reply(200, {
      invites: [{ id: 9, role: "caregiver", expires_at: "2026-11-28T10:00:00Z" }],
    });
    routes["DELETE /api/pet-invite-codes/9"] = reply(200, { ok: true });
    const screen = panel();
    await waitFor(() => screen.getByTestId("invite-code-revoke-9"));
    expect(screen.queryByTestId("invite-code-value")).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId("invite-code-revoke-9")));
    await waitFor(() =>
      expect(global.fetch.mock.calls.some(([u, o]) => u === "/api/pet-invite-codes/9" && o.method === "DELETE")).toBe(true),
    );
  });

  test("a server refusal is a friendly sentence", async () => {
    routes["POST /api/pet-invite-codes"] = reply(503, { code: "invite_codes_unavailable", error: "RAW" });
    const screen = panel();
    await act(async () => fireEvent.press(screen.getByTestId("invite-code-create")));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(alertSpy.mock.calls[0][1]).toBe("Invite codes aren't available yet. Please try again later.");
  });
});

describe("joining", () => {
  const type = (screen, value) => fireEvent.changeText(screen.getByTestId("redeem-invite-input"), value);

  test("the button waits for a full code; success selects the dog and opens the app", async () => {
    routes["POST /api/pet-invite-codes/redeem"] = reply(200, { ok: true, pet_id: 7, pet_name: "Luna", role: "family" });
    const screen = wrap(<RedeemInviteCard />);
    type(screen, "ABCD");
    expect(screen.getByTestId("redeem-invite-join").props.accessibilityState.disabled).toBe(true);
    type(screen, CODE.toLowerCase());
    await act(async () => fireEvent.press(screen.getByTestId("redeem-invite-join")));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/(tabs)"));
    expect(useSelectedPetStore.getState().selectedPetId).toBe(7);
    expect(alertSpy.mock.calls[0]).toEqual(["You're in!", "Luna is now in your app."]);
    expect(logs.join("\n").toUpperCase()).not.toContain("ABCD");
  });

  test("a code from a link is filled in, not used by itself", () => {
    const screen = wrap(<RedeemInviteCard initialCode={CODE} />);
    expect(screen.getByTestId("redeem-invite-input").props.value).toBe(CODE);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test.each([
    ["invite_invalid", "That code doesn't work. Check it and try again."],
    ["invite_expired", "That code has expired. Ask for a new one."],
    ["invite_used", "That code was already used. Ask for a new one."],
    ["invite_revoked", "That code was cancelled. Ask for a new one."],
    ["rate_limited", "Too many tries. Wait a few minutes and try again."],
    [undefined, "We couldn't do that right now. Please try again in a moment."],
  ])("%s", async (code, expected) => {
    routes["POST /api/pet-invite-codes/redeem"] = reply(409, { code, error: "RAW SERVER" });
    const screen = wrap(<RedeemInviteCard initialCode={CODE} />);
    await act(async () => fireEvent.press(screen.getByTestId("redeem-invite-join")));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(alertSpy.mock.calls[0][1]).toBe(expected);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test("Spanish", async () => {
    await i18n.changeLanguage("es");
    const screen = wrap(<RedeemInviteCard />);
    expect(screen.getByText("¿Tenés un código de invitación?")).toBeTruthy();
    expect(screen.getByText("Unirme")).toBeTruthy();
  });

  test("onboarding offers it, so a new account without a dog can reach it", () => {
    const screen = wrap(<HaveInviteCodeLink />);
    fireEvent.press(screen.getByText("I have an invite code"));
    expect(mockRouter.push).toHaveBeenCalledWith("/pet-sharing?tab=shared");
  });
});
