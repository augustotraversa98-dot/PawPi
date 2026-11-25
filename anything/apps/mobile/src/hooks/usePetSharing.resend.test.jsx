// Resend invite: each server answer becomes a friendly sentence in EN and ES (never the server's own English text),
// and the cooldown follows the server.
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Alert } from "react-native";
import i18n from "@/i18n";
import { useResendInvite, RESEND_COOLDOWN_MS } from "./usePetSharing";
import useInviteCooldownStore from "@/store/inviteCooldownStore";

const client = () => new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity } } });
let qc;
let alertSpy;
const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const answer = (status, body) => {
  global.fetch = jest.fn(async () => ({ ok: status < 300, status, json: async () => body }));
};
const resend = async () => {
  const { result } = renderHook(() => useResendInvite(1), { wrapper });
  await act(async () => {
    result.current.mutate(11);
  });
  await waitFor(() => expect(alertSpy).toHaveBeenCalled());
  return alertSpy.mock.calls[0];
};
const cooldown = () => (useInviteCooldownStore.getState().until[11] ?? 0) - Date.now();

beforeEach(async () => {
  qc = client();
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  useInviteCooldownStore.getState().reset();
  await i18n.changeLanguage("en");
});
afterEach(() => jest.restoreAllMocks());

test("success: posts to the resend endpoint, says so, and rests for an hour", async () => {
  answer(200, { ok: true });
  const [title] = await resend();
  expect(global.fetch.mock.calls[0][0]).toBe("/api/pet-caregivers/11/resend");
  expect(global.fetch.mock.calls[0][1].method).toBe("POST");
  expect(title).toBe("Invite sent again");
  expect(cooldown()).toBeGreaterThan(RESEND_COOLDOWN_MS - 5000);
});

test("too soon: tells the minutes the server asked to wait", async () => {
  answer(429, { code: "resend_too_soon", retry_after_seconds: 600, error: "You just sent this invitation." });
  const [title, body] = await resend();
  expect(title).toBe("Already sent");
  expect(body).toContain("10 min");
  expect(cooldown()).toBeLessThanOrEqual(600 * 1000);
});

test.each([
  [429, "resend_limit", "That's plenty of reminders"],
  [409, "invite_not_pending", "Nothing to resend"],
  [404, "grant_not_found", "Nothing to resend"],
  [503, "sharing_lifecycle_unavailable", "Not sent"],
  [500, undefined, "Not sent"],
])("%s %s is friendly", async (status, code, expected) => {
  answer(status, { code, error: "SERVER ENGLISH SENTENCE" });
  const [title, body] = await resend();
  expect(title).toBe(expected);
  expect(`${title} ${body}`).not.toContain("SERVER ENGLISH");
});

test("a network failure shows no technical text", async () => {
  global.fetch = jest.fn(async () => {
    throw new TypeError("Network request failed");
  });
  const [, body] = await resend();
  expect(body).toBe("We couldn't send the invite. Please try again in a moment.");
});

test("Spanish (voseo)", async () => {
  await i18n.changeLanguage("es");
  answer(429, { code: "resend_too_soon", retry_after_seconds: 3600 });
  const [title, body] = await resend();
  expect(title).toBe("Ya la enviaste");
  expect(body).toBe("Podés volver a enviar esta invitación en unos 60 min.");
});
