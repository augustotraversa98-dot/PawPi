import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/client-diagnostics — authenticated, allow-listed, size-capped beacon that only writes one
// structured log line. No DB.

import { POST, __resetClientDiagnosticsForTests } from "./route";
import { auth } from "@/auth";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: "9999999999" };
const req = (body, raw) =>
  new Request("http://localhost/api/client-diagnostics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
const GOOD = {
  event: "onboarding_wizard_for_existing_owner",
  where: "mount",
  screen: "onboarding-photo",
  session_age_s: 37,
  trail: [
    { p: "/(tabs)", ago_s: 60 },
    { p: "/services", ago_s: 20 },
    { p: "/onboarding-photo", ago_s: 0 },
  ],
  platform: "ios",
  os_version: "26.5",
  app_version: "1.0.1",
  build: "24",
};
const loggedRecord = (warn) => JSON.parse(warn.mock.calls[0][0].replace("[client-diagnostics] ", ""));

let warn;
beforeEach(() => {
  vi.clearAllMocks();
  __resetClientDiagnosticsForTests();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("POST /api/client-diagnostics", () => {
  it("401 when unauthenticated — and logs nothing", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(req(GOOD));
    expect(res.status).toBe(401);
    expect(warn).not.toHaveBeenCalled();
  });

  it("400 for an unknown event (closed allow-list) or a non-JSON body", async () => {
    auth.mockResolvedValue(SESSION);
    expect((await POST(req({ ...GOOD, event: "something_else" }))).status).toBe(400);
    expect((await POST(req(null, "not json"))).status).toBe(400);
    expect(warn).not.toHaveBeenCalled();
  });

  it("200 and ONE structured log line carrying the caller's auth id + the breadcrumb", async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(req(GOOD));
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^\[client-diagnostics\] \{/);
    expect(loggedRecord(warn)).toEqual({
      event: "onboarding_wizard_for_existing_owner",
      auth_user_id: "42",
      where: "mount",
      screen: "onboarding-photo",
      session_age_s: 37,
      trail: GOOD.trail,
      platform: "ios",
      os_version: "26.5",
      app_version: "1.0.1",
      build: "24",
    });
  });

  it("the id comes from the session, never from the body", async () => {
    auth.mockResolvedValue(SESSION);
    await POST(req({ ...GOOD, auth_user_id: "999", user: { id: 999 } }));
    const rec = loggedRecord(warn);
    expect(rec.auth_user_id).toBe("42");
    expect(JSON.stringify(rec)).not.toContain("999");
  });

  it("drops unknown fields and truncates/caps oversized ones (nothing is logged verbatim)", async () => {
    auth.mockResolvedValue(SESSION);
    const trail = Array.from({ length: 40 }, (_, i) => ({ p: "x".repeat(500), ago_s: i, secret: "s" }));
    await POST(
      req({
        ...GOOD,
        trail,
        screen: "s".repeat(500),
        where: "bogus",
        session_age_s: "NaN",
        email: "a@b.c",
        extra: { a: 1 },
      }),
    );
    const rec = loggedRecord(warn);
    expect(rec.trail).toHaveLength(15);
    expect(rec.trail[0].p).toHaveLength(80);
    expect(rec.trail[0]).not.toHaveProperty("secret");
    expect(rec.screen).toHaveLength(40);
    expect(rec).not.toHaveProperty("where");
    expect(rec).not.toHaveProperty("session_age_s");
    expect(rec).not.toHaveProperty("email");
    expect(rec).not.toHaveProperty("extra");
  });

  it("429 once a user exceeds the per-minute cap; another user is unaffected", async () => {
    auth.mockResolvedValue(SESSION);
    for (let i = 0; i < 5; i++) expect((await POST(req(GOOD))).status).toBe(200);
    expect((await POST(req(GOOD))).status).toBe(429);
    expect(warn).toHaveBeenCalledTimes(5);

    auth.mockResolvedValue({ user: { id: 43 }, expires: "9999999999" });
    expect((await POST(req(GOOD))).status).toBe(200);
  });
});
