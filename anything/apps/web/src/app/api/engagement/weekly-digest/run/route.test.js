import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// POST /api/engagement/weekly-digest/run — notifications v2 (PR 3b): does NOTHING unless NOTIF_V2_ENABLED is on;
// the in-app digest is unchanged; a phone push is attempted only after the bell row is written (opt-in is decided
// by the owner push pipeline).

vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({
  withTransaction: (fn) => fn(),
  setCurrentUserId: vi.fn(),
  withSavepoint: (fn) => fn(),
}));
vi.mock("@/app/api/utils/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/app/api/utils/ownerNotifications", () => ({ pushForOwnerNotification: vi.fn() }));

import { POST } from "./route";
import sql from "@/app/api/utils/sql";
import { sendEmail } from "@/app/api/utils/email";
import { pushForOwnerNotification } from "@/app/api/utils/ownerNotifications";

const ROW = {
  pet_id: 5,
  owner_user_id: 7,
  pet_name: "Rex",
  tz: "America/Buenos_Aires",
  week_start: "2026-09-28",
  push_enabled: true,
  email_enabled: false,
  email: "owner@example.com",
  preferred_locale: "en",
};
const run = (secret = "s3cret") =>
  new Request("http://localhost/api/engagement/weekly-digest/run", {
    method: "POST",
    headers: { "x-cron-secret": secret },
    body: "{}",
  });

function routeSql({ row = ROW, claim = [{ id: 1 }], notifyId = 99 } = {}) {
  sql.mockImplementation(async (strings) => {
    const q = strings.join("?");
    if (q.includes("app_weekly_digest_due")) return [row];
    if (q.includes("INSERT INTO weekly_digest_state")) return claim;
    if (q.includes("FROM health_walk_logs")) return [{ n: 3 }];
    if (q.includes("FROM posts")) return [{ n: 1 }];
    if (q.includes("FROM pet_care_days")) return [{ n: 4 }];
    if (q.includes("FROM pet_streaks")) return [{ current_count: 5 }];
    if (q.includes("app_notify")) return [{ id: notifyId }];
    throw new Error(`unexpected sql: ${q}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.CRON_SECRET = "s3cret";
  delete process.env.NOTIF_V2_ENABLED;
  sendEmail.mockResolvedValue({ sent: true });
  pushForOwnerNotification.mockResolvedValue({ pushed: true });
});
afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.NOTIF_V2_ENABLED;
});

describe("auth + flag", () => {
  it("no CRON_SECRET → 503; wrong secret → 401", async () => {
    delete process.env.CRON_SECRET;
    expect((await POST(run())).status).toBe(503);
    process.env.CRON_SECRET = "s3cret";
    expect((await POST(run("nope"))).status).toBe(401);
  });
  it("flag OFF → {skipped}, NO query, no email, no push", async () => {
    routeSql();
    const res = await POST(run());
    expect(await res.json()).toEqual({ skipped: "disabled" });
    expect(sql).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(pushForOwnerNotification).not.toHaveBeenCalled();
  });
});

describe("flag ON", () => {
  beforeEach(() => {
    process.env.NOTIF_V2_ENABLED = "true";
  });

  it("writes the in-app digest, then asks the owner push pipeline (opt-in decided there)", async () => {
    routeSql();
    const body = await (await POST(run())).json();
    expect(body).toMatchObject({ processed: 1, sent: 1, failed: [] });
    const order = sql.mock.calls.map((c) => c[0].join("?"));
    expect(order.some((q) => q.includes("app_notify"))).toBe(true);
    expect(pushForOwnerNotification).toHaveBeenCalledTimes(1);
    expect(pushForOwnerNotification).toHaveBeenCalledWith({
      recipient: 7,
      type: "weekly_digest",
      subjectRef: "5",
      petName: "Rex",
    });
    expect(sendEmail).not.toHaveBeenCalled(); // email stays opt-in (weekly_digest_prefs.email_enabled)
  });

  it("owner switched the digest's own push channel OFF → no bell, no phone push", async () => {
    routeSql({ row: { ...ROW, push_enabled: false } });
    await POST(run());
    expect(sql.mock.calls.some((c) => c[0].join("?").includes("app_notify"))).toBe(false);
    expect(pushForOwnerNotification).not.toHaveBeenCalled();
  });

  it("week already claimed → skipped, nothing sent (idempotent re-run)", async () => {
    routeSql({ claim: [] });
    const body = await (await POST(run())).json();
    expect(body.skipped).toEqual([{ petId: 5, reason: "already sent" }]);
    expect(pushForOwnerNotification).not.toHaveBeenCalled();
  });

  it("app_notify created no row (null id) → no phone push", async () => {
    routeSql({ notifyId: null });
    await POST(run());
    expect(pushForOwnerNotification).not.toHaveBeenCalled();
  });

  it("email behaviour is unchanged for owners who opted into the digest email", async () => {
    routeSql({ row: { ...ROW, email_enabled: true } });
    await POST(run());
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe("owner@example.com");
  });
});
