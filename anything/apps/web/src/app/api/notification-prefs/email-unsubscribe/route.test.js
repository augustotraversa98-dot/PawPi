import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { GET, POST } from "./route";
import sql from "@/app/api/utils/sql";
import { makeUnsubscribeToken } from "@/app/api/utils/emailUnsubscribe";

vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));

const url = (t) => `http://localhost/api/notification-prefs/email-unsubscribe${t === undefined ? "" : `?t=${encodeURIComponent(t)}`}`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.AUTH_SECRET = "test-auth-secret-123456";
  delete process.env.NOTIF_V2_ENABLED;
});
afterEach(() => {
  delete process.env.NOTIF_V2_ENABLED;
  delete process.env.AUTH_SECRET;
});

describe("email-unsubscribe", () => {
  it("bad / missing / forged token → 400 and NO write (page and JSON)", async () => {
    process.env.NOTIF_V2_ENABLED = "true";
    expect((await GET(new Request(url()))).status).toBe(400);
    expect((await GET(new Request(url("garbage")))).status).toBe(400);
    expect((await POST(new Request(url("garbage"), { method: "POST" }))).status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("flag ON: a valid link turns win-back email consent OFF for exactly that user (idempotent)", async () => {
    process.env.NOTIF_V2_ENABLED = "true";
    sql.mockResolvedValue([{ app_set_email_consent: true }]);
    const t = makeUnsubscribeToken(42, "winback_email");
    const res = await GET(new Request(url(t)));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("unsubscribed");
    expect(html).toContain("Listo"); // bilingual page
    const call = sql.mock.calls[0];
    expect(call[0].join("?")).toContain("app_set_email_consent");
    expect(call.slice(1)).toEqual([42, "winback_email"]);
    // second click: still 200
    expect((await GET(new Request(url(t)))).status).toBe(200);
  });

  it("POST (RFC 8058 one-click) → JSON 200", async () => {
    process.env.NOTIF_V2_ENABLED = "true";
    sql.mockResolvedValue([{}]);
    const res = await POST(new Request(url(makeUnsubscribeToken(7, "winback_email")), { method: "POST" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("flag OFF: valid link still answers 200 but issues NO query", async () => {
    const res = await GET(new Request(url(makeUnsubscribeToken(42, "winback_email"))));
    expect(res.status).toBe(200);
    expect(sql).not.toHaveBeenCalled();
  });

  it("a DB error (schema absent) never surfaces to the person clicking", async () => {
    process.env.NOTIF_V2_ENABLED = "true";
    sql.mockRejectedValue(Object.assign(new Error("fn missing"), { code: "42883" }));
    expect((await GET(new Request(url(makeUnsubscribeToken(42, "winback_email"))))).status).toBe(200);
  });

  it("the invalid-link page leaks nothing about accounts", async () => {
    const res = await GET(new Request(url("garbage")));
    const html = await res.text();
    expect(html).not.toMatch(/user|account \d|@/i);
  });
});
