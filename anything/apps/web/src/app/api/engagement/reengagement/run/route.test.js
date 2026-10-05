import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// POST /api/engagement/reengagement/run — win-back sender. Notifications v2: does NOTHING unless NOTIF_V2_ENABLED is
// on (PR 3b); with it on there is NO email without explicit consent + a working unsubscribe link (PR 3a) and a phone
// push only for owners who opted in (`winback_push`, PR 3b).

vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/requestContext", () => ({
  withTransaction: (fn) => fn(),
  setCurrentUserId: vi.fn(),
  withSavepoint: (fn) => fn(),
}));
vi.mock("@/app/api/utils/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/app/api/utils/ownerNotifications", () => ({ pushForOwnerNotification: vi.fn().mockResolvedValue({ pushed: false }) }));

import { POST } from "./route";
import sql from "@/app/api/utils/sql";
import { sendEmail } from "@/app/api/utils/email";
import { pushForOwnerNotification } from "@/app/api/utils/ownerNotifications";
import { __resetNotifV2SchemaStateForTests } from "@/app/api/utils/notifV2";

const ROW = {
  pet_id: 5,
  owner_user_id: 7,
  pet_name: "Rex",
  today: "2026-10-05",
  birthday: null,
  adoption_date: null,
  friend_name: null,
  email: "owner@example.com",
  preferred_locale: "en",
};
const run = () =>
  new Request("http://localhost/api/engagement/reengagement/run", {
    method: "POST",
    headers: { "x-cron-secret": "s3cret" },
    body: "{}",
  });
const text = (c) => c[0].join("?");

function routeSql({ consent }) {
  sql.mockImplementation(async (strings) => {
    const q = strings.join("?");
    if (q.includes("app_reengagement_due")) return [ROW];
    if (q.includes("INSERT INTO reengagement_state")) return [{ pet_id: 5 }];
    if (q.includes("app_notify")) return [{ app_notify: 1 }];
    if (q.includes("app_notification_pref_enabled")) return [{ enabled: consent }];
    if (q.includes("app_log_notification_send")) return [{ app_log_notification_send: 1 }];
    throw new Error(`unexpected sql: ${q}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  __resetNotifV2SchemaStateForTests();
  process.env.CRON_SECRET = "s3cret";
  process.env.AUTH_SECRET = "test-auth-secret-123456";
  delete process.env.NOTIF_V2_ENABLED;
  sendEmail.mockResolvedValue({ sent: true, id: "m1" });
  pushForOwnerNotification.mockResolvedValue({ pushed: false });
});
afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.AUTH_SECRET;
  delete process.env.NOTIF_V2_ENABLED;
});

describe("flag OFF — does nothing", () => {
  it("authorised caller, flag off → {skipped}, no query, no email, no push", async () => {
    routeSql({ consent: true });
    const res = await POST(run());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skipped: "disabled" });
    expect(sql).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(pushForOwnerNotification).not.toHaveBeenCalled();
  });
  it("the secret is still checked first (503 unset / 401 wrong)", async () => {
    delete process.env.CRON_SECRET;
    expect((await POST(run())).status).toBe(503);
    process.env.CRON_SECRET = "s3cret";
    const bad = new Request("http://localhost/x", { method: "POST", headers: { "x-cron-secret": "nope" } });
    expect((await POST(bad)).status).toBe(401);
  });
});

describe("flag ON — consent required", () => {
  beforeEach(() => {
    process.env.NOTIF_V2_ENABLED = "true";
  });

  it("no consent row (default) → the in-app win-back is created but NO email is sent", async () => {
    routeSql({ consent: null });
    const body = await (await POST(run())).json();
    expect(body.sent).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sql.mock.calls.some((c) => text(c).includes("app_notify"))).toBe(true);
  });

  it("explicit opt-out → no email", async () => {
    routeSql({ consent: false });
    await POST(run());
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("consent but NO signing key → no email (never email without a working unsubscribe link)", async () => {
    delete process.env.AUTH_SECRET;
    routeSql({ consent: true });
    await POST(run());
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("consent + signing key → email WITH unsubscribe footer + List-Unsubscribe headers, and the send is logged", async () => {
    routeSql({ consent: true });
    await POST(run());
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const msg = sendEmail.mock.calls[0][0];
    expect(msg.to).toBe("owner@example.com");
    expect(msg.text).toContain("/api/notification-prefs/email-unsubscribe?t=");
    expect(msg.text).toContain("Stop them any time"); // recipient locale en
    expect(msg.headers["List-Unsubscribe"]).toMatch(/^<https:\/\/.+email-unsubscribe\?t=.+>$/);
    expect(msg.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const log = sql.mock.calls.find((c) => text(c).includes("app_log_notification_send"));
    expect(text(log)).toContain("'winback_email', 'email'");
    expect(log.slice(1)).toEqual([7, "5"]); // owner profile id + pet id as subject_ref
  });

  it("an account without any email address never gets one (consent irrelevant)", async () => {
    routeSql({ consent: true });
    const noEmail = { ...ROW, email: null };
    sql.mockImplementation(async (strings) => {
      const q = strings.join("?");
      if (q.includes("app_reengagement_due")) return [noEmail];
      if (q.includes("INSERT INTO reengagement_state")) return [{ pet_id: 5 }];
      if (q.includes("app_notify")) return [{}];
      return [{ enabled: true }];
    });
    await POST(run());
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("asks the owner push pipeline (opt-in decided there) AFTER the in-app win-back is written, with the pet name", async () => {
    routeSql({ consent: false });
    await POST(run());
    expect(pushForOwnerNotification).toHaveBeenCalledTimes(1);
    expect(pushForOwnerNotification).toHaveBeenCalledWith({
      recipient: 7,
      type: "winback",
      subjectRef: "5",
      petName: "Rex",
    });
  });

  it("a capped / opted-out pet gets no push attempt at all", async () => {
    sql.mockImplementation(async (strings) => {
      const q = strings.join("?");
      if (q.includes("app_reengagement_due")) return [ROW];
      if (q.includes("INSERT INTO reengagement_state")) return []; // cap guard says no
      return [{ enabled: false }];
    });
    const body = await (await POST(run())).json();
    expect(body.skipped).toHaveLength(1);
    expect(pushForOwnerNotification).not.toHaveBeenCalled();
  });
});
