// Notifications v2 foundation (migration 0131) against REAL Postgres, acting AS pawpi_app (FORCE RLS):
//   • push_tickets + notification_send_log are own-row READABLE and NOT writable by the app role;
//   • the DEFINER helpers: valid-token reader, mark-invalid, ticket bookkeeping, the atomic per-user daily cap
//     (owner-local day), the send log, retention sweep, and the win-back email-consent writer;
//   • the real code on top: PUT /api/user-profile/timezone and sendPush's v2 pipeline end to end.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MIGRATIONS_DIR, makeTestSql, resetDb, seedUser } from "./db";

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const expoMock = vi.hoisted(() => ({
  send: vi.fn(),
}));
vi.mock("expo-server-sdk", () => ({
  Expo: class {
    sendPushNotificationsAsync = expoMock.send;
    chunkPushNotifications = (m: any[]) => [m];
    static isExpoPushToken(t: any) {
      return typeof t === "string" && t.startsWith("ExponentPushToken");
    }
  },
}));

const A = { authUserId: 1, profileId: 1, username: "alice" };
const B = { authUserId: 2, profileId: 2, username: "bob" };
const TOK_A = "ExponentPushToken[aaa]";
const TOK_B = "ExponentPushToken[bbb]";

let raw: Sql;
let app: Sql;
let appSql: any;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? "" : String(userId)}, true)`;
    return fn(tx as unknown as Sql);
  });
}

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject("TEST_DATABASE_URL"));
  app = postgres({
    host: url.hostname,
    port: Number(url.port),
    database: url.pathname.replace(/^\//, ""),
    username: "pawpi_app",
    password: "pawpi_app",
    max: 1,
    onnotice: () => {},
  });
  url.username = "pawpi_app";
  url.password = "pawpi_app";
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = "disable";
  appSql = (await import("@/app/api/utils/sql")).default;
});

afterAll(async () => {
  await appSql.end?.();
  await app.end();
  await raw.end();
});

beforeEach(async () => {
  for (const u of [A, B]) await seedUser(raw, u);
  delete process.env.NOTIF_V2_ENABLED;
  expoMock.send.mockReset();
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
  delete process.env.NOTIF_V2_ENABLED;
});

describe("migration 0131", () => {
  it("is idempotent: re-applying it twice changes nothing and does not throw", async () => {
    const sqlText = readFileSync(path.join(MIGRATIONS_DIR, "0131_notifications_v2_foundation.sql"), "utf8");
    await raw.unsafe(sqlText);
    await raw.unsafe(sqlText);
    const policies = await raw`select policyname from pg_policies where tablename in ('push_tickets','notification_send_log') order by 1`;
    expect(policies.map((p) => p.policyname)).toEqual(["notification_send_log_owner_select", "push_tickets_owner_select"]);
  });
});

describe("RLS: the new tables are readable own-row, never writable by the app role", () => {
  it("send log + tickets: each user sees only their own rows; no identity sees none", async () => {
    await raw`insert into notification_send_log (owner_user_id, type, channel) values (1, 'a', 'push'), (2, 'b', 'push')`;
    await raw`insert into push_tickets (owner_user_id, token, ticket_id) values (1, ${TOK_A}, 'T1'), (2, ${TOK_B}, 'T2')`;
    await asApp(1, async (tx) => {
      expect(await tx`select type from notification_send_log`).toEqual([{ type: "a" }]);
      expect(await tx`select ticket_id from push_tickets`).toEqual([{ ticket_id: "T1" }]);
    });
    await asApp(null, async (tx) => {
      expect(await tx`select 1 from notification_send_log`).toHaveLength(0);
      expect(await tx`select 1 from push_tickets`).toHaveLength(0);
    });
  });

  it("pawpi_app cannot insert, update or delete either table directly (no write policy)", async () => {
    await raw`insert into notification_send_log (owner_user_id, type, channel) values (1, 'a', 'push')`;
    await raw`insert into push_tickets (owner_user_id, token, ticket_id) values (1, ${TOK_A}, 'T1')`;
    await expect(
      asApp(1, (tx) => tx`insert into notification_send_log (owner_user_id, type, channel) values (1, 'forged', 'push')`),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asApp(1, (tx) => tx`insert into push_tickets (owner_user_id, token, ticket_id) values (1, 'x', 'forged')`),
    ).rejects.toThrow(/row-level security/);
    // UPDATE / DELETE silently affect zero rows (no policy to match)
    await asApp(1, async (tx) => {
      expect((await tx`update notification_send_log set outcome = 'suppressed_cap' returning 1`).length).toBe(0);
      expect((await tx`delete from notification_send_log returning 1`).length).toBe(0);
      expect((await tx`delete from push_tickets returning 1`).length).toBe(0);
    });
    expect((await raw`select count(*)::int n from notification_send_log`)[0].n).toBe(1);
  });
});

describe("tokens: valid reader + mark invalid", () => {
  it("app_recipient_valid_push_tokens skips invalid tokens; the 0109 reader is untouched", async () => {
    await raw`insert into device_push_tokens (user_id, token, platform, invalid_since)
              values (1, ${TOK_A}, 'ios', now()), (1, 'ExponentPushToken[ok]', 'ios', null)`;
    await asApp(2, async (tx) => {
      // the actor (B) resolves A's tokens through the DEFINER readers
      const valid = await tx`select token from app_recipient_valid_push_tokens(1)`;
      expect(valid.map((r) => r.token)).toEqual(["ExponentPushToken[ok]"]);
      const legacy = await tx`select token from app_recipient_push_tokens(1)`;
      expect(legacy).toHaveLength(2);
    });
  });

  it("app_mark_push_token_invalid flags the token for EVERY user holding it, once", async () => {
    await raw`insert into device_push_tokens (user_id, token, platform) values (1, ${TOK_A}, 'ios'), (2, ${TOK_A}, 'ios'), (2, ${TOK_B}, 'ios')`;
    const [first] = await asApp(1, (tx) => tx`select app_mark_push_token_invalid(${TOK_A}) as n`);
    expect(first.n).toBe(2);
    const [again] = await asApp(1, (tx) => tx`select app_mark_push_token_invalid(${TOK_A}) as n`);
    expect(again.n).toBe(0);
    const rows = await raw`select user_id, token, invalid_since is not null as dead from device_push_tokens order by user_id, token`;
    expect(rows.map((r) => [r.user_id, r.token, r.dead])).toEqual([
      [1, TOK_A, true],
      [2, TOK_A, true],
      [2, TOK_B, false],
    ]);
  });
});

describe("tickets", () => {
  it("record → pending (age-gated) → resolve", async () => {
    await asApp(2, async (tx) => {
      await tx`select app_record_push_ticket(1, ${TOK_A}, 'T-new')`;
      await tx`select app_record_push_ticket(1, ${TOK_A}, 'T-new')`; // duplicate ticket id: no-op
      await tx`select app_record_push_ticket(999, ${TOK_A}, 'T-ghost')`; // unknown user: no-op
    });
    expect((await raw`select count(*)::int n from push_tickets`)[0].n).toBe(1);
    await raw`update push_tickets set created_at = now() - interval '20 minutes' where ticket_id = 'T-new'`;
    await raw`insert into push_tickets (owner_user_id, token, ticket_id) values (1, ${TOK_B}, 'T-fresh')`;

    const pending = await asApp(2, (tx) => tx`select * from app_pending_push_tickets(900, 100)`);
    expect(pending.map((r) => r.ticket_id)).toEqual(["T-new"]); // 15-min age gate excludes T-fresh
    const [resolved] = await asApp(2, (tx) => tx`select app_resolve_push_tickets(${[pending[0].id]}::bigint[]) as n`);
    expect(Number(resolved.n)).toBe(1);
    expect(await asApp(2, (tx) => tx`select * from app_pending_push_tickets(900, 100)`)).toHaveLength(0);
  });
});

describe("per-user daily cap + send log", () => {
  it("app_reserve_notification_send enforces the cap per user and logs the suppression", async () => {
    const reserve = (user: number, cap: number | null) =>
      asApp(2, async (tx) => (await tx`select app_reserve_notification_send(${user}, 'booking_confirmed', 'owner_bookings', 'push', '5', ${cap}) as ok`)[0].ok);
    expect([await reserve(1, 2), await reserve(1, 2), await reserve(1, 2)]).toEqual([true, true, false]);
    expect(await reserve(2, 2)).toBe(true); // another user's allowance is untouched
    const [{ n }] = await asApp(1, (tx) => tx`select app_notification_sends_today(1) as n`);
    expect(n).toBe(2);
    const outcomes = await raw`select outcome, count(*)::int n from notification_send_log where owner_user_id = 1 group by outcome order by outcome`;
    expect(outcomes.map((r) => [r.outcome, r.n])).toEqual([["sent", 2], ["suppressed_cap", 1]]);
  });

  it("a NULL cap only logs; an unknown user / bad channel reserves nothing", async () => {
    const r = (u: number, ch = "push") =>
      asApp(1, async (tx) => (await tx`select app_reserve_notification_send(${u}, 't', null, ${ch}, null, null) as ok`)[0].ok);
    expect([await r(1), await r(1), await r(1)]).toEqual([true, true, true]);
    expect(await r(999)).toBe(false);
    expect(await r(1, "sms")).toBe(false);
  });

  it("the cap counts the owner-LOCAL day: yesterday's sends (in the owner's zone) do not count", async () => {
    await raw`update user_profiles set timezone = 'Pacific/Kiritimati' where id = 1`; // UTC+14
    const [{ d }] = await raw`select app_user_day_start(1) as d`;
    // a send 1 second before the owner's local midnight is "yesterday"
    await raw`insert into notification_send_log (owner_user_id, type, channel, sent_at) values (1, 't', 'push', ${new Date(new Date(d).getTime() - 1000)})`;
    await raw`insert into notification_send_log (owner_user_id, type, channel, sent_at) values (1, 't', 'push', ${new Date(new Date(d).getTime() + 1000)})`;
    const [{ n }] = await raw`select app_notification_sends_today(1) as n`;
    expect(n).toBe(1);
    // and the day start is within the last 24h
    const [{ ok }] = await raw`select (app_user_day_start(1) <= now() and app_user_day_start(1) > now() - interval '25 hours') as ok`;
    expect(ok).toBe(true);
  });

  it("an unusable stored zone falls back to America/Buenos_Aires instead of raising", async () => {
    await raw`update user_profiles set timezone = 'Not/AZone' where id = 1`;
    const [{ ok }] = await raw`select app_user_day_start(1) is not null as ok`;
    expect(ok).toBe(true);
    const [{ ok: ok2 }] = await raw`select app_user_day_start(12345) is not null as ok`; // no such user
    expect(ok2).toBe(true);
  });

  it("app_log_notification_send records suppressions; rejects unknown outcome/user", async () => {
    const log = (u: number, outcome: string) =>
      asApp(2, async (tx) => (await tx`select app_log_notification_send(${u}, 't', 'c', 'push', null, ${outcome}) as id`)[0].id);
    expect(await log(1, "suppressed_quiet")).not.toBeNull();
    expect(await log(1, "weird")).toBeNull();
    expect(await log(999, "sent")).toBeNull();
    // suppressed rows never count toward the cap
    expect((await raw`select app_notification_sends_today(1) as n`)[0].n).toBe(0);
  });

  it("the retention sweep deletes only rows older than the window (min 7 days)", async () => {
    await raw`insert into notification_send_log (owner_user_id, type, channel, sent_at) values (1, 'old', 'push', now() - interval '100 days'), (1, 'new', 'push', now() - interval '1 day')`;
    const [{ n }] = await asApp(1, (tx) => tx`select app_notification_send_log_gc(90) as n`);
    expect(n).toBe(1);
    expect((await raw`select type from notification_send_log`).map((r) => r.type)).toEqual(["new"]);
    await asApp(1, (tx) => tx`select app_notification_send_log_gc(0)`); // clamps to 7 days: a 1-day-old row survives
    expect((await raw`select count(*)::int n from notification_send_log`)[0].n).toBe(1);
  });
});

describe("win-back email consent", () => {
  it("writes ONLY the winback_email category, for an existing user, without any identity", async () => {
    const set = (u: number, c: string, e: boolean | null) =>
      asApp(null, async (tx) => (await tx`select app_set_email_consent(${u}, ${c}, ${e}) as ok`)[0].ok);
    expect(await set(1, "winback_email", true)).toBe(true);
    expect((await raw`select enabled from notification_prefs where user_id = 1 and category = 'winback_email'`)[0].enabled).toBe(true);
    expect(await set(1, "winback_email", false)).toBe(true); // unsubscribe flips it
    expect((await raw`select enabled from notification_prefs where user_id = 1 and category = 'winback_email'`)[0].enabled).toBe(false);
    expect(await set(1, "biz_booking", false)).toBe(false); // cannot be used to flip any other pref
    expect(await set(999, "winback_email", true)).toBe(false);
    expect(await set(1, "winback_email", null)).toBe(false);
    expect((await raw`select count(*)::int n from notification_prefs`)[0].n).toBe(1);
    // and the 0109 pref reader (what the sender consults) sees it
    expect((await raw`select app_notification_pref_enabled(1, 'winback_email') as e`)[0].e).toBe(false);
  });
});

describe("PUT /api/user-profile/timezone (real route, real DB)", () => {
  const put = (timezone: string) =>
    new Request("http://localhost/api/user-profile/timezone", { method: "PUT", body: JSON.stringify({ timezone }) });
  let PUT: (r: Request) => Promise<Response>;
  beforeAll(async () => {
    PUT = (await import("@/app/api/user-profile/timezone/route")).PUT as any;
  });

  it("flag OFF: nothing is written", async () => {
    authState.session = { user: { id: 1 }, expires: "9999999999" };
    const res = await PUT(put("Europe/Madrid"));
    expect((await res.json()).skipped).toBe("disabled");
    expect((await raw`select timezone from user_profiles where id = 1`)[0].timezone).toBeNull();
  });

  it("flag ON: stores the caller's own zone only; unknown zones are rejected", async () => {
    process.env.NOTIF_V2_ENABLED = "true";
    authState.session = { user: { id: 1 }, expires: "9999999999" };
    expect((await PUT(put("Europe/Madrid"))).status).toBe(200);
    expect((await raw`select timezone from user_profiles where id = 1`)[0].timezone).toBe("Europe/Madrid");
    expect((await raw`select timezone from user_profiles where id = 2`)[0].timezone).toBeNull(); // not B's
    expect((await PUT(put("Mars/Olympus"))).status).toBe(400);
    expect((await raw`select timezone from user_profiles where id = 1`)[0].timezone).toBe("Europe/Madrid");
    // the stored value is usable by the SQL consumers
    expect((await raw`select (now() at time zone timezone) is not null as ok from user_profiles where id = 1`)[0].ok).toBe(true);
  });
});

describe("sendPush v2 end to end (real DB, mocked Expo)", () => {
  let sendPush: any;
  beforeAll(async () => {
    sendPush = (await import("@/app/api/utils/push")).sendPush;
  });

  async function actorSend(opts: any) {
    // like production: the send runs inside the ACTOR's request transaction
    return appSql.begin(async (tx: any) => {
      const { runWithTx } = await import("@/app/api/utils/sql");
      await tx`select set_config('app.current_user_id', '2', true)`;
      return (runWithTx as any)(tx, () => sendPush(1, { title: "t", body: "b" }, opts));
    });
  }

  it("skips an invalid token, logs the send, records the ticket, honours the cap", async () => {
    process.env.NOTIF_V2_ENABLED = "true";
    await raw`insert into device_push_tokens (user_id, token, platform, invalid_since) values (1, ${TOK_A}, 'ios', now())`;
    await raw`insert into device_push_tokens (user_id, token, platform) values (1, ${TOK_B}, 'ios')`;
    expoMock.send.mockResolvedValue([{ status: "ok", id: "TKT-1" }]);

    const r1 = await actorSend({ type: "booking_confirmed", category: "owner_bookings", subjectRef: "5", cap: 1 });
    expect(r1.sent).toBe(1);
    const sentTo = expoMock.send.mock.calls[0][0].map((m: any) => m.to);
    expect(sentTo).toEqual([TOK_B]); // the invalid token never receives a push
    expect((await raw`select ticket_id from push_tickets`).map((r) => r.ticket_id)).toEqual(["TKT-1"]);
    expect((await raw`select type, category, channel, outcome from notification_send_log`)[0]).toMatchObject({
      type: "booking_confirmed", category: "owner_bookings", channel: "push", outcome: "sent",
    });

    // second push the same local day with cap 1 → blocked, Expo not called again
    const r2 = await actorSend({ type: "booking_declined", category: "owner_bookings", subjectRef: "6", cap: 1 });
    expect(r2).toEqual({ sent: 0, skipped: "cap" });
    expect(expoMock.send).toHaveBeenCalledTimes(1);
  });

  it("DeviceNotRegistered in the ticket marks the token invalid so the next send skips it", async () => {
    process.env.NOTIF_V2_ENABLED = "true";
    await raw`insert into device_push_tokens (user_id, token, platform) values (1, ${TOK_A}, 'ios')`;
    expoMock.send.mockResolvedValue([{ status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }]);
    await actorSend({ type: "x", cap: null });
    expect((await raw`select invalid_since is not null as dead from device_push_tokens`)[0].dead).toBe(true);
    expoMock.send.mockClear();
    expect(await actorSend({ type: "x", cap: null })).toEqual({ sent: 0, skipped: "no-tokens" });
    expect(expoMock.send).not.toHaveBeenCalled();
  });

  it("flag OFF: the legacy reader runs — an invalid token is NOT skipped (behaviour unchanged) and no v2 row is written", async () => {
    await raw`insert into device_push_tokens (user_id, token, platform, invalid_since) values (1, ${TOK_A}, 'ios', now())`;
    expoMock.send.mockResolvedValue([{ status: "ok", id: "TKT-9" }]);
    const r = await actorSend({ type: "x", cap: 1 });
    expect(r.sent).toBe(1);
    expect((await raw`select count(*)::int n from notification_send_log`)[0].n).toBe(0);
    expect((await raw`select count(*)::int n from push_tickets`)[0].n).toBe(0);
  });
});
