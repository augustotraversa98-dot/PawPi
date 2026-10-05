// Notifications v2, PR 3c — owner events reach the phone, against REAL Postgres as pawpi_app (FORCE RLS):
//   • notification_settings (0132): own-row RLS, DEFINER reader (defaults / overrides / owner zone), idempotent;
//   • ACCEPTANCE (flag ON, real safeNotify → app_notify → push pipeline, Expo mocked): no push goes to an owner who
//     disabled that category, is inside their quiet hours, is over the daily cap, or has an invalid token —
//     while the in-app bell row is ALWAYS written; promotional types need an explicit opt-in;
//   • flag OFF: owner events stay bell-only (behaviour unchanged) and no v2 row is written.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MIGRATIONS_DIR, makeTestSql, resetDb, seedUser } from "./db";

const expoMock = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("expo-server-sdk", () => ({
  Expo: class {
    sendPushNotificationsAsync = expoMock.send;
    chunkPushNotifications = (m: any[]) => [m];
    static isExpoPushToken(t: any) {
      return typeof t === "string" && t.startsWith("ExponentPushToken");
    }
  },
}));

const ACTOR = { authUserId: 1, profileId: 1, username: "provider" };
const OWNER = { authUserId: 2, profileId: 2, username: "owner" };
const OTHER = { authUserId: 3, profileId: 3, username: "other" };
const TOKEN = "ExponentPushToken[owner-phone]";

let raw: Sql;
let app: Sql;
let appSql: any;
let safeNotify: any;
let pushForOwnerNotification: any;
let runWithTx: any;
let __reset: () => void;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? "" : String(userId)}, true)`;
    return fn(tx as unknown as Sql);
  });
}

/** Run `fn` the way production does: inside the ACTOR's request transaction (identity = the provider). */
function asActorRequest<T>(fn: () => Promise<T>): Promise<T> {
  return appSql.begin(async (tx: any) => {
    await tx`select set_config('app.current_user_id', ${String(ACTOR.profileId)}, true)`;
    return runWithTx(tx, fn);
  });
}

const notify = (type: string, subjectRef = "1") =>
  asActorRequest(() => safeNotify({ recipient: OWNER.profileId, actor: ACTOR.profileId, type, subjectRef }));

const bellRows = async () =>
  (await raw`select type from notifications where recipient_user_id = ${OWNER.profileId} order by id`).map((r) => r.type);
const sendLog = async () =>
  (await raw`select type, category, outcome from notification_send_log order by id`).map((r) => [r.type, r.category, r.outcome]);

/** Quiet window that contains the current hour whatever happens at an hour boundary. */
const alwaysQuiet = (tz = "UTC") => {
  const h = new Date().getUTCHours();
  return { start: (h + 23) % 24, end: (h + 2) % 24, tz };
};

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
  const sqlMod: any = await import("@/app/api/utils/sql");
  appSql = sqlMod.default;
  runWithTx = sqlMod.runWithTx;
  safeNotify = (await import("@/app/api/utils/notify")).safeNotify;
  pushForOwnerNotification = (await import("@/app/api/utils/ownerNotifications")).pushForOwnerNotification;
  __reset = (await import("@/app/api/utils/notifV2")).__resetNotifV2SchemaStateForTests;
});

afterAll(async () => {
  await appSql.end?.();
  await app.end();
  await raw.end();
});

beforeEach(async () => {
  for (const u of [ACTOR, OWNER, OTHER]) await seedUser(raw, u);
  await raw`update user_profiles set timezone = 'UTC', preferred_locale = 'en' where id = ${OWNER.profileId}`;
  await raw`insert into device_push_tokens (user_id, token, platform) values (${OWNER.profileId}, ${TOKEN}, 'ios')`;
  // outside quiet hours by default (disabled) so each test opts INTO the rule it is proving
  await raw`insert into notification_settings (owner_user_id, quiet_hours_enabled) values (${OWNER.profileId}, false)`;
  expoMock.send.mockReset();
  expoMock.send.mockImplementation(async (msgs: any[]) => msgs.map((_, i) => ({ status: "ok", id: `T-${Math.random()}-${i}` })));
  process.env.NOTIF_V2_ENABLED = "true";
  delete process.env.NOTIF_V2_DAILY_CAP;
  __reset();
});

afterEach(async () => {
  await resetDb(raw);
  delete process.env.NOTIF_V2_ENABLED;
  delete process.env.NOTIF_V2_DAILY_CAP;
});

describe("migration 0132", () => {
  it("is idempotent (re-applying twice is harmless)", async () => {
    const sqlText = readFileSync(path.join(MIGRATIONS_DIR, "0132_notification_settings.sql"), "utf8");
    await raw.unsafe(sqlText);
    await raw.unsafe(sqlText);
    expect((await raw`select count(*)::int n from pg_policies where tablename = 'notification_settings'`)[0].n).toBe(1);
  });
});

describe("notification_settings: RLS + DEFINER reader", () => {
  it("own-row only: a user reads/writes just their row; others and no-identity see none", async () => {
    await asApp(OTHER.profileId, async (tx) => {
      await tx`insert into notification_settings (owner_user_id, quiet_start) values (${OTHER.profileId}, 21)`;
      expect(await tx`select owner_user_id from notification_settings`).toEqual([{ owner_user_id: OTHER.profileId }]);
    });
    // writing ANOTHER user's row is rejected (separate transaction: the violation aborts it)
    await expect(
      asApp(OTHER.profileId, (tx) => tx`insert into notification_settings (owner_user_id) values (${OWNER.profileId})`),
    ).rejects.toThrow(/row-level security/);
    await asApp(null, async (tx) => expect(await tx`select 1 from notification_settings`).toHaveLength(0));
    await asApp(OWNER.profileId, async (tx) => {
      const rows = await tx`select owner_user_id from notification_settings`;
      expect(rows).toEqual([{ owner_user_id: OWNER.profileId }]);
    });
  });

  it("hours are CHECKed 0-23", async () => {
    await expect(raw`update notification_settings set quiet_start = 24 where owner_user_id = ${OWNER.profileId}`).rejects.toThrow();
    await expect(raw`update notification_settings set quiet_end = -1 where owner_user_id = ${OWNER.profileId}`).rejects.toThrow();
  });

  it("app_recipient_notification_settings: defaults without a row, the row + owner zone with one, nothing for a ghost user", async () => {
    // OTHER has no settings row, no timezone
    const [d] = await asApp(ACTOR.profileId, (tx) => tx`select * from app_recipient_notification_settings(${OTHER.profileId})`);
    expect(d).toEqual({ quiet_hours_enabled: true, quiet_start: 22, quiet_end: 8, timezone: null });
    const [o] = await asApp(ACTOR.profileId, (tx) => tx`select * from app_recipient_notification_settings(${OWNER.profileId})`);
    expect(o).toEqual({ quiet_hours_enabled: false, quiet_start: 22, quiet_end: 8, timezone: "UTC" });
    expect(await asApp(ACTOR.profileId, (tx) => tx`select * from app_recipient_notification_settings(9999)`)).toHaveLength(0);
  });
});

describe("ACCEPTANCE — flag ON: owner events ring the phone, within the owner's rules", () => {
  it("baseline: a booking confirmation rings the owner's phone in their language and is logged; the bell row exists", async () => {
    await notify("booking_confirmed", "55");
    expect(await bellRows()).toEqual(["booking_confirmed"]);
    expect(expoMock.send).toHaveBeenCalledTimes(1);
    const msg = expoMock.send.mock.calls[0][0][0];
    expect(msg.to).toBe(TOKEN);
    expect(msg.title).toBe("Booking confirmed ✅");
    expect(msg.data).toEqual({ type: "booking_confirmed", subjectRef: "55" });
    expect(await sendLog()).toEqual([["booking_confirmed", "owner_bookings", "sent"]]);
  });

  it("es-AR copy when the owner's stored language is es", async () => {
    await raw`update user_profiles set preferred_locale = 'es' where id = ${OWNER.profileId}`;
    await notify("adoption_approved");
    expect(expoMock.send.mock.calls[0][0][0].title).toBe("Buenas noticias sobre tu solicitud 🐾");
  });

  it("every transactional owner event type rings (bookings, adoption decisions, walker accepted, lost alert)", async () => {
    process.env.NOTIF_V2_DAILY_CAP = "50";
    const types = ["booking_confirmed", "booking_declined", "booking_cancelled", "adoption_approved", "adoption_declined", "walk_request_accepted", "lost_alert"];
    for (const t of types) await notify(t);
    expect(expoMock.send).toHaveBeenCalledTimes(types.length);
    expect(await bellRows()).toEqual(types);
  });

  it("types that are NOT owner push types never ring (social, under-review, requested…)", async () => {
    for (const t of ["paw", "bark", "follow", "adoption_under_review", "booking_requested", "welcome"]) await notify(t);
    expect(expoMock.send).not.toHaveBeenCalled();
    expect(await bellRows()).toHaveLength(6); // …but every one still lands in the bell
  });

  it("DISABLED CATEGORY → no push (other categories still ring); bell row still written", async () => {
    await raw`insert into notification_prefs (user_id, category, enabled) values (${OWNER.profileId}, 'owner_bookings', false)`;
    await notify("booking_confirmed");
    expect(expoMock.send).not.toHaveBeenCalled();
    expect(await bellRows()).toEqual(["booking_confirmed"]);
    await notify("adoption_approved"); // a different category
    expect(expoMock.send).toHaveBeenCalledTimes(1);
  });

  it("QUIET HOURS → no push, bell row still written, nothing logged as sent", async () => {
    const q = alwaysQuiet();
    await raw`update notification_settings set quiet_hours_enabled = true, quiet_start = ${q.start}, quiet_end = ${q.end} where owner_user_id = ${OWNER.profileId}`;
    await notify("booking_confirmed");
    expect(expoMock.send).not.toHaveBeenCalled();
    expect(await bellRows()).toEqual(["booking_confirmed"]);
    expect(await sendLog()).toEqual([]);
  });

  it("DEFAULT quiet hours protect an owner who never opened Settings (no settings row at all)", async () => {
    await raw`delete from notification_settings where owner_user_id = ${OWNER.profileId}`;
    // pick a zone where it is currently night: the zone whose local hour is 02:00 right now
    const h = new Date().getUTCHours();
    const offset = (2 - h + 24) % 24; // hours to add to UTC to get 02:00 local
    const tz = `Etc/GMT${offset === 0 ? "" : offset <= 12 ? `-${offset}` : `+${24 - offset}`}`;
    await raw`update user_profiles set timezone = ${tz} where id = ${OWNER.profileId}`;
    await notify("booking_confirmed");
    expect(expoMock.send).not.toHaveBeenCalled();
  });

  it("OVER CAP → no push (the cap is per owner, per local day, and counts only pushes sent)", async () => {
    process.env.NOTIF_V2_DAILY_CAP = "2";
    await notify("booking_confirmed", "1");
    await notify("booking_declined", "2");
    await notify("booking_cancelled", "3");
    expect(expoMock.send).toHaveBeenCalledTimes(2);
    expect(await bellRows()).toHaveLength(3); // the 3rd is still in the bell
    expect((await sendLog()).map((r) => r[2])).toEqual(["sent", "sent", "suppressed_cap"]);
  });

  it("INVALID TOKEN → no push; a valid second device still rings", async () => {
    await raw`update device_push_tokens set invalid_since = now() where token = ${TOKEN}`;
    await notify("booking_confirmed");
    expect(expoMock.send).not.toHaveBeenCalled();
    await raw`insert into device_push_tokens (user_id, token, platform) values (${OWNER.profileId}, 'ExponentPushToken[tablet]', 'ios')`;
    await notify("booking_declined");
    expect(expoMock.send.mock.calls[0][0].map((m: any) => m.to)).toEqual(["ExponentPushToken[tablet]"]);
  });

  it("Expo says DeviceNotRegistered → the token is invalidated and never used again", async () => {
    expoMock.send.mockImplementationOnce(async () => [{ status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }]);
    await notify("booking_confirmed");
    expect((await raw`select invalid_since is not null as dead from device_push_tokens`)[0].dead).toBe(true);
    expoMock.send.mockClear();
    await notify("booking_declined");
    expect(expoMock.send).not.toHaveBeenCalled();
  });

  it("another user's rules never affect this owner (prefs/cap/quiet are per owner)", async () => {
    await raw`insert into notification_prefs (user_id, category, enabled) values (${OTHER.profileId}, 'owner_bookings', false)`;
    await raw`insert into notification_send_log (owner_user_id, type, channel) select ${OTHER.profileId}, 'x', 'push' from generate_series(1, 10)`;
    await notify("booking_confirmed");
    expect(expoMock.send).toHaveBeenCalledTimes(1);
  });

  it("PROMOTIONAL needs an explicit opt-in: digest/win-back stay silent until the owner turns them on", async () => {
    const dig = () => asActorRequest(() => pushForOwnerNotification({ recipient: OWNER.profileId, type: "weekly_digest", subjectRef: "5", petName: "Rex" }));
    expect((await dig()).skipped).toBe("pref");
    expect(expoMock.send).not.toHaveBeenCalled();
    await raw`insert into notification_prefs (user_id, category, enabled) values (${OWNER.profileId}, 'weekly_digest_push', true)`;
    expect((await dig()).pushed).toBe(true);
    expect(expoMock.send.mock.calls[0][0][0].title).toBe("Rex's week 🐾");
  });
});

describe("flag OFF — production behaviour unchanged", () => {
  it("owner events stay bell-only: no push, no send log, no ticket; settings are never read", async () => {
    delete process.env.NOTIF_V2_ENABLED;
    for (const t of ["booking_confirmed", "adoption_approved", "walk_request_accepted", "lost_alert"]) await notify(t);
    expect(await bellRows()).toHaveLength(4);
    expect(expoMock.send).not.toHaveBeenCalled();
    expect((await raw`select count(*)::int n from notification_send_log`)[0].n).toBe(0);
    expect((await raw`select count(*)::int n from push_tickets`)[0].n).toBe(0);
  });
});
