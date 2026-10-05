import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Notifications v2 push pipeline (flag NOTIF_V2_ENABLED): valid-token reader, invalid-token handling,
// ticket recording, send-log/cap reservation — and, critically, that with the flag OFF none of it runs.

const mock = vi.hoisted(() => ({
  send: vi.fn(),
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
vi.mock("@/app/api/utils/requestContext", () => ({ withSavepoint: (fn) => fn() }));

import sql from "@/app/api/utils/sql";
import { sendPush, __resetExpoClientForTests } from "./push";
import { __resetNotifV2SchemaStateForTests } from "./notifV2";

const TOKEN = "ExponentPushToken[abc123]";
const TOKEN2 = "ExponentPushToken[def456]";
const text = (call) => call[0].join("?");

// Route a mocked tagged-template call to a response by the function name in the SQL text.
function routeSql(handlers) {
  sql.mockImplementation(async (strings, ...values) => {
    const q = strings.join("?");
    for (const [needle, h] of Object.entries(handlers)) {
      if (q.includes(needle)) return typeof h === "function" ? h(values, q) : h;
    }
    throw new Error(`unexpected sql: ${q}`);
  });
}
const sqlTexts = () => sql.mock.calls.map(text);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  __resetExpoClientForTests();
  __resetNotifV2SchemaStateForTests();
  delete process.env.EXPO_ACCESS_TOKEN;
  delete process.env.NOTIF_V2_ENABLED;
  mock.send.mockResolvedValue([]);
});
afterEach(() => {
  delete process.env.NOTIF_V2_ENABLED;
});

describe("flag OFF — production behaviour unchanged", () => {
  it("uses ONLY the legacy token reader; never touches a v2 function or table", async () => {
    routeSql({ "app_recipient_push_tokens": [{ token: TOKEN, platform: "ios" }] });
    const res = await sendPush(9, { title: "t", body: "b" }, { type: "biz_booking", cap: 1 });
    expect(res).toEqual({ sent: 1 });
    expect(sqlTexts()).toHaveLength(1);
    expect(sqlTexts()[0]).toContain("app_recipient_push_tokens");
    for (const q of sqlTexts()) {
      expect(q).not.toMatch(/valid_push_tokens|reserve_notification_send|record_push_ticket|mark_push_token_invalid|send_log|push_tickets/);
    }
  });
});

describe("flag ON", () => {
  beforeEach(() => {
    process.env.NOTIF_V2_ENABLED = "true";
  });

  it("reads tokens through the VALID-token reader (invalid tokens are excluded by the DB function)", async () => {
    routeSql({
      "app_recipient_valid_push_tokens": [{ token: TOKEN, platform: "ios" }],
      "app_reserve_notification_send": [{ ok: true }],
    });
    mock.send.mockResolvedValue([{ status: "ok", id: "T1" }]);
    const res = await sendPush(9, { title: "t", body: "b" }, { type: "biz_booking", category: "biz_booking", subjectRef: "1", cap: null });
    expect(res.sent).toBe(1);
    expect(sqlTexts().some((q) => q.includes("app_recipient_valid_push_tokens"))).toBe(true);
    expect(sqlTexts().some((q) => q.includes("app_recipient_push_tokens("))).toBe(false); // legacy reader not used
  });

  it("no valid tokens (all dead) → nothing sent, no slot reserved", async () => {
    routeSql({ "app_recipient_valid_push_tokens": [] });
    const res = await sendPush(9, { title: "t", body: "b" }, { type: "paw", cap: 3 });
    expect(res).toEqual({ sent: 0, skipped: "no-tokens" });
    expect(mock.send).not.toHaveBeenCalled();
    expect(sqlTexts().some((q) => q.includes("reserve_notification_send"))).toBe(false);
  });

  it("filters out anything that is not an Expo token", async () => {
    routeSql({
      "app_recipient_valid_push_tokens": [{ token: "garbage", platform: "ios" }],
    });
    expect((await sendPush(9, { title: "t" }, { type: "x" })).sent).toBe(0);
    expect(mock.send).not.toHaveBeenCalled();
  });

  it("OVER CAP → no push, Expo never called", async () => {
    routeSql({
      "app_recipient_valid_push_tokens": [{ token: TOKEN, platform: "ios" }],
      "app_reserve_notification_send": [{ ok: false }],
    });
    const res = await sendPush(9, { title: "t", body: "b" }, { type: "booking_confirmed", category: "owner_bookings", subjectRef: "5", cap: 3 });
    expect(res).toEqual({ sent: 0, skipped: "cap" });
    expect(mock.send).not.toHaveBeenCalled();
  });

  it("passes (recipient, type, category, 'push', subjectRef, cap) to the atomic reservation", async () => {
    routeSql({
      "app_recipient_valid_push_tokens": [{ token: TOKEN, platform: "ios" }],
      "app_reserve_notification_send": [{ ok: true }],
    });
    await sendPush(9, { title: "t" }, { type: "booking_confirmed", category: "owner_bookings", subjectRef: "5", cap: 3 });
    const call = sql.mock.calls.find((c) => text(c).includes("app_reserve_notification_send"));
    expect(call.slice(1)).toEqual([9, "booking_confirmed", "owner_bookings", "5", 3]);
  });

  it("records every ok ticket for the receipts job", async () => {
    routeSql({
      "app_recipient_valid_push_tokens": [
        { token: TOKEN, platform: "ios" },
        { token: TOKEN2, platform: "android" },
      ],
      "app_reserve_notification_send": [{ ok: true }],
      "app_record_push_ticket": [],
    });
    mock.send.mockResolvedValue([{ status: "ok", id: "T1" }, { status: "ok", id: "T2" }]);
    await sendPush(9, { title: "t" }, { type: "biz_booking" });
    const recorded = sql.mock.calls.filter((c) => text(c).includes("app_record_push_ticket"));
    expect(recorded.map((c) => c.slice(1))).toEqual([[9, TOKEN, "T1"], [9, TOKEN2, "T2"]]);
  });

  it("a DeviceNotRegistered ticket marks THAT token invalid immediately", async () => {
    routeSql({
      "app_recipient_valid_push_tokens": [
        { token: TOKEN, platform: "ios" },
        { token: TOKEN2, platform: "ios" },
      ],
      "app_reserve_notification_send": [{ ok: true }],
      "app_record_push_ticket": [],
      "app_mark_push_token_invalid": [{ app_mark_push_token_invalid: 1 }],
    });
    mock.send.mockResolvedValue([
      { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
      { status: "ok", id: "T2" },
    ]);
    await sendPush(9, { title: "t" }, { type: "biz_booking" });
    const marked = sql.mock.calls.filter((c) => text(c).includes("app_mark_push_token_invalid"));
    expect(marked.map((c) => c.slice(1))).toEqual([[TOKEN]]);
    const recorded = sql.mock.calls.filter((c) => text(c).includes("app_record_push_ticket"));
    expect(recorded.map((c) => c.slice(1))).toEqual([[9, TOKEN2, "T2"]]);
  });

  it("other ticket errors do not invalidate the token", async () => {
    routeSql({
      "app_recipient_valid_push_tokens": [{ token: TOKEN, platform: "ios" }],
      "app_reserve_notification_send": [{ ok: true }],
    });
    mock.send.mockResolvedValue([{ status: "error", message: "rate", details: { error: "MessageRateExceeded" } }]);
    await sendPush(9, { title: "t" }, { type: "biz_booking" });
    expect(sqlTexts().some((q) => q.includes("mark_push_token_invalid"))).toBe(false);
  });

  it("FAILS SOFT with the migration absent: falls back to the legacy reader and still sends", async () => {
    routeSql({
      "app_recipient_valid_push_tokens": () => { throw Object.assign(new Error("fn missing"), { code: "42883" }); },
      "app_recipient_push_tokens": [{ token: TOKEN, platform: "ios" }],
    });
    const res = await sendPush(9, { title: "t", body: "b" }, { type: "biz_booking", cap: 3 });
    expect(res.sent).toBe(1);
    expect(mock.send).toHaveBeenCalledTimes(1);
    // no reservation / ticket queries are attempted against a schema known to be missing
    expect(sqlTexts().some((q) => /reserve_notification_send|record_push_ticket/.test(q))).toBe(false);
  });

  it("a reservation DB error fails OPEN (send), never closed", async () => {
    routeSql({
      "app_recipient_valid_push_tokens": [{ token: TOKEN, platform: "ios" }],
      "app_reserve_notification_send": () => { throw new Error("db down"); },
      "app_record_push_ticket": [],
    });
    mock.send.mockResolvedValue([{ status: "ok", id: "T1" }]);
    expect((await sendPush(9, { title: "t" }, { type: "biz_booking", cap: 3 })).sent).toBe(1);
  });

  it("never throws when Expo itself fails", async () => {
    routeSql({
      "app_recipient_valid_push_tokens": [{ token: TOKEN, platform: "ios" }],
      "app_reserve_notification_send": [{ ok: true }],
    });
    mock.send.mockRejectedValue(new Error("APNs not configured"));
    expect((await sendPush(9, { title: "t" }, { type: "biz_booking" })).sent).toBe(0);
  });
});
