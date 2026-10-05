import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// POST /api/notifications/push-receipts/run — Expo receipts job (notifications v2, PR 3a).

const expoMock = vi.hoisted(() => ({
  chunkIds: vi.fn((ids) => [ids]),
  getReceipts: vi.fn(),
}));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({ withSavepoint: (fn) => fn() }));
vi.mock("@/app/api/utils/push", () => ({
  getExpoClient: () => ({
    chunkPushNotificationReceiptIds: expoMock.chunkIds,
    getPushNotificationReceiptsAsync: expoMock.getReceipts,
  }),
}));

import { POST } from "./route";
import sql from "@/app/api/utils/sql";
import { __resetNotifV2SchemaStateForTests } from "@/app/api/utils/notifV2";

const run = (secret = "s3cret") =>
  new Request("http://localhost/api/notifications/push-receipts/run", {
    method: "POST",
    headers: secret === null ? {} : { "x-cron-secret": secret },
  });
const text = (c) => c[0].join("?");
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();

function routeSql(handlers) {
  sql.mockImplementation(async (strings, ...values) => {
    const q = strings.join("?");
    for (const [needle, h] of Object.entries(handlers)) {
      if (q.includes(needle)) return typeof h === "function" ? h(values, q) : h;
    }
    throw new Error(`unexpected sql: ${q}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  __resetNotifV2SchemaStateForTests();
  process.env.CRON_SECRET = "s3cret";
  delete process.env.NOTIF_V2_ENABLED;
});
afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.NOTIF_V2_ENABLED;
});

describe("auth + flag", () => {
  it("no CRON_SECRET → 503", async () => {
    delete process.env.CRON_SECRET;
    expect((await POST(run())).status).toBe(503);
  });
  it("wrong / missing secret → 401", async () => {
    expect((await POST(run("nope"))).status).toBe(401);
    expect((await POST(run(null))).status).toBe(401);
  });
  it("flag OFF → does NOTHING: no query, no Expo call", async () => {
    const res = await POST(run());
    expect(await res.json()).toEqual({ skipped: "disabled" });
    expect(sql).not.toHaveBeenCalled();
    expect(expoMock.getReceipts).not.toHaveBeenCalled();
  });
});

describe("flag ON", () => {
  beforeEach(() => {
    process.env.NOTIF_V2_ENABLED = "true";
  });

  it("schema not applied → clean 200 no-op", async () => {
    routeSql({ app_pending_push_tickets: () => { throw Object.assign(new Error("x"), { code: "42883" }); } });
    const res = await POST(run());
    expect(res.status).toBe(200);
    expect((await res.json()).note).toMatch(/not available/);
    expect(expoMock.getReceipts).not.toHaveBeenCalled();
  });

  it("ok receipt resolves; DeviceNotRegistered marks the token invalid; not-ready stays pending; >24h expires", async () => {
    routeSql({
      app_pending_push_tickets: [
        { id: 1, owner_user_id: 7, token: "ExponentPushToken[a]", ticket_id: "OK", created_at: hoursAgo(1) },
        { id: 2, owner_user_id: 7, token: "ExponentPushToken[dead]", ticket_id: "DEAD", created_at: hoursAgo(1) },
        { id: 3, owner_user_id: 8, token: "ExponentPushToken[c]", ticket_id: "LATER", created_at: hoursAgo(1) },
        { id: 4, owner_user_id: 8, token: "ExponentPushToken[d]", ticket_id: "OLD", created_at: hoursAgo(30) },
        { id: 5, owner_user_id: 9, token: "ExponentPushToken[e]", ticket_id: "ERR", created_at: hoursAgo(2) },
      ],
      app_mark_push_token_invalid: [{ app_mark_push_token_invalid: 1 }],
      app_resolve_push_tickets: [{ n: 4 }],
      app_notification_send_log_gc: [{ n: 0 }],
    });
    expoMock.getReceipts.mockResolvedValue({
      OK: { status: "ok" },
      DEAD: { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
      ERR: { status: "error", message: "big", details: { error: "MessageTooBig" } },
      // LATER: no receipt yet
    });
    const res = await POST(run());
    const body = await res.json();
    expect(body).toMatchObject({ processed: 5, ok: 1, invalidated: 1, otherErrors: 1, stillPending: 1, resolved: 4 });

    // Expo was asked only about the in-window tickets (OLD is >24h → resolved without asking)
    expect(expoMock.chunkIds).toHaveBeenCalledWith(["OK", "DEAD", "LATER", "ERR"]);
    const marked = sql.mock.calls.filter((c) => text(c).includes("app_mark_push_token_invalid"));
    expect(marked.map((c) => c.slice(1))).toEqual([["ExponentPushToken[dead]"]]);
    // resolved = OK(1) + DEAD(2) + ERR(5) + OLD(4); LATER(3) stays pending
    const resolve = sql.mock.calls.find((c) => text(c).includes("app_resolve_push_tickets"));
    expect([...resolve[1]].sort()).toEqual([1, 2, 4, 5]);
  });

  it("an Expo outage leaves everything pending (nothing resolved) and never throws", async () => {
    routeSql({
      app_pending_push_tickets: [
        { id: 1, owner_user_id: 7, token: "ExponentPushToken[a]", ticket_id: "A", created_at: hoursAgo(1) },
      ],
      app_notification_send_log_gc: [{ n: 0 }],
    });
    expoMock.getReceipts.mockRejectedValue(new Error("network"));
    const res = await POST(run());
    expect(res.status).toBe(200);
    expect(sql.mock.calls.some((c) => text(c).includes("app_resolve_push_tickets"))).toBe(false);
  });

  it("never logs a token value", async () => {
    const spy = vi.spyOn(console, "error");
    routeSql({
      app_pending_push_tickets: [
        { id: 1, owner_user_id: 7, token: "ExponentPushToken[SECRETTOKEN]", ticket_id: "A", created_at: hoursAgo(1) },
      ],
      app_resolve_push_tickets: [{ n: 1 }],
      app_notification_send_log_gc: [{ n: 0 }],
    });
    expoMock.getReceipts.mockResolvedValue({ A: { status: "error", details: { error: "InvalidCredentials" } } });
    await POST(run());
    expect(JSON.stringify(spy.mock.calls)).not.toContain("SECRETTOKEN");
  });
});
