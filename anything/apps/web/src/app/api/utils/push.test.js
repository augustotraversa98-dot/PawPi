import { describe, it, expect, vi, beforeEach } from "vitest";

// BN2 PR1 — the remote-push send layer + the post-app_notify hook. The Expo client
// is fully mocked (no network); sql is mocked so we drive the DEFINER-reader returns.

const mock = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue([]),
  chunk: vi.fn((msgs) => [msgs]),
  isToken: vi.fn((t) => typeof t === "string" && t.startsWith("ExponentPushToken")),
}));

vi.mock("expo-server-sdk", () => ({
  Expo: class {
    constructor() {
      this.sendPushNotificationsAsync = mock.send;
      this.chunkPushNotifications = mock.chunk;
    }
    static isExpoPushToken(t) {
      return mock.isToken(t);
    }
  },
}));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

import sql from "@/app/api/utils/sql";
import {
  sendPush,
  decidePush,
  renderPushContent,
  pushForNotification,
  resolveRecipientTokens,
  __resetExpoClientForTests,
} from "./push";
import { CHANNEL_CLASS } from "./notificationCategories";

const TOKEN = "ExponentPushToken[abc123]";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  __resetExpoClientForTests();
  delete process.env.EXPO_ACCESS_TOKEN;
});

describe("decidePush (the BN2 push rule)", () => {
  it("IN_APP_ONLY never pushes, regardless of pref", () => {
    expect(decidePush(CHANNEL_CLASS.IN_APP_ONLY, undefined)).toBe(false);
    expect(decidePush(CHANNEL_CLASS.IN_APP_ONLY, true)).toBe(false);
  });
  it("PUSH pushes on absent (undefined) or true; only explicit false suppresses", () => {
    expect(decidePush(CHANNEL_CLASS.PUSH, undefined)).toBe(true);
    expect(decidePush(CHANNEL_CLASS.PUSH, true)).toBe(true);
    expect(decidePush(CHANNEL_CLASS.PUSH, false)).toBe(false);
  });
  it("OPTIONAL_PUSH pushes only when explicitly enabled (absent = off)", () => {
    expect(decidePush(CHANNEL_CLASS.OPTIONAL_PUSH, undefined)).toBe(false);
    expect(decidePush(CHANNEL_CLASS.OPTIONAL_PUSH, false)).toBe(false);
    expect(decidePush(CHANNEL_CLASS.OPTIONAL_PUSH, true)).toBe(true);
  });
});

describe("renderPushContent (bilingual)", () => {
  it("renders ES by default and EN when asked", () => {
    expect(renderPushContent("walk_request_targeted", null, "en").title).toBe(
      "New walk request",
    );
    expect(renderPushContent("walk_request_targeted", null, "es").title).toBe(
      "Nueva solicitud de paseo",
    );
  });
  it("falls back to generic copy for an unknown type", () => {
    expect(renderPushContent("some_future_type", null, "en").title).toBe("PawPi");
    expect(renderPushContent("some_future_type", null, "es").message).toContain(
      "notificación",
    );
  });
});

describe("resolveRecipientTokens", () => {
  it("returns only valid Expo tokens", async () => {
    sql.mockResolvedValueOnce([
      { token: TOKEN, platform: "ios" },
      { token: "not-a-token", platform: "android" },
    ]);
    expect(await resolveRecipientTokens(7)).toEqual([TOKEN]);
  });
  it("degrades to [] when the table/function is absent (42P01/42883)", async () => {
    sql.mockRejectedValueOnce({ code: "42P01" });
    expect(await resolveRecipientTokens(7)).toEqual([]);
    sql.mockRejectedValueOnce({ code: "42883" });
    expect(await resolveRecipientTokens(7)).toEqual([]);
  });
});

describe("sendPush", () => {
  it("no tokens → no-op, never calls Expo", async () => {
    sql.mockResolvedValueOnce([]); // no rows
    const res = await sendPush(9, { title: "t", body: "b" });
    expect(res).toEqual({ sent: 0, skipped: "no-tokens" });
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("with a token → sends one chunk", async () => {
    sql.mockResolvedValueOnce([{ token: TOKEN, platform: "ios" }]);
    const res = await sendPush(9, { title: "t", body: "b", data: { k: 1 } });
    expect(res.sent).toBe(1);
    expect(mock.send).toHaveBeenCalledTimes(1);
    const chunkArg = mock.send.mock.calls[0][0];
    expect(chunkArg[0]).toMatchObject({ to: TOKEN, title: "t", body: "b" });
  });
  it("never throws when Expo errors — returns sent:0", async () => {
    sql.mockResolvedValueOnce([{ token: TOKEN, platform: "ios" }]);
    mock.send.mockRejectedValueOnce(new Error("APNs not configured"));
    const res = await sendPush(9, { title: "t", body: "b" });
    expect(res.sent).toBe(0); // the single failed chunk is swallowed
  });
});

describe("pushForNotification (post-app_notify hook)", () => {
  it("IN_APP_ONLY type → never pushes, no sql/Expo calls", async () => {
    const res = await pushForNotification({
      recipient: 5,
      type: "biz_follow", // uncataloged → defaults to IN_APP_ONLY in PR1
      subjectRef: "1",
    });
    expect(res).toEqual({ pushed: false });
    expect(sql).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
  });

  it("PUSH type (walk_request_targeted) → resolves locale + tokens and sends", async () => {
    sql.mockResolvedValueOnce([{ locale: "en" }]); // app_recipient_locale
    sql.mockResolvedValueOnce([{ token: TOKEN, platform: "ios" }]); // tokens
    const res = await pushForNotification({
      recipient: 5,
      actor: 1,
      type: "walk_request_targeted",
      subjectRef: "42",
    });
    expect(res.pushed).toBe(true);
    expect(mock.send).toHaveBeenCalledTimes(1);
    const msg = mock.send.mock.calls[0][0][0];
    expect(msg.title).toBe("New walk request"); // rendered in EN per locale
    expect(msg.data).toMatchObject({ type: "walk_request_targeted", subjectRef: "42" });
  });

  it("PUSH type with no tokens → pushed:false, still no throw", async () => {
    sql.mockResolvedValueOnce([{ locale: "es" }]);
    sql.mockResolvedValueOnce([]); // no tokens
    const res = await pushForNotification({
      recipient: 5,
      type: "walk_request_broadcast",
      subjectRef: "9",
    });
    expect(res.pushed).toBe(false);
  });
});
