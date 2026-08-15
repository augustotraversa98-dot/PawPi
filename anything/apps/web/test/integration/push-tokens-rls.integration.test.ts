// BN2 PR1 — device_push_tokens own-row RLS + the DEFINER readers (migration 0109),
// proven as pawpi_app on real Postgres.
//
// Proves: a user reads/writes ONLY their own tokens under FORCE RLS; the
// app_recipient_push_tokens DEFINER reader resolves ANOTHER user's tokens (the
// send-hook path, which runs as the actor, not the recipient); the pref + locale
// DEFINER readers likewise cross the owner boundary.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedUser } from "./db";

const A = { authUserId: 1, profileId: 1, username: "alice" };
const B = { authUserId: 2, profileId: 2, username: "bob" };

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? "" : String(userId)}, true)`;
    return fn(tx);
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
});
afterAll(async () => {
  await app.end();
  await raw.end();
});
afterEach(async () => {
  await resetDb(raw);
});

beforeEach(async () => {
  await seedUser(raw, A);
  await seedUser(raw, B);
});

describe("device_push_tokens own-row RLS", () => {
  it("a user can insert + read only their OWN token", async () => {
    await asApp(A.profileId, async (tx) => {
      await tx`insert into device_push_tokens (user_id, token, platform) values (${A.profileId}, 'ExponentPushToken[A]', 'ios')`;
      const mine = await tx`select token from device_push_tokens`;
      expect(mine.map((r: any) => r.token)).toEqual(["ExponentPushToken[A]"]);
    });
    await asApp(B.profileId, async (tx) => {
      await tx`insert into device_push_tokens (user_id, token, platform) values (${B.profileId}, 'ExponentPushToken[B]', 'android')`;
      // B sees ONLY its own token — A's is invisible under FORCE RLS.
      const mine = await tx`select token from device_push_tokens`;
      expect(mine.map((r: any) => r.token)).toEqual(["ExponentPushToken[B]"]);
    });
  });

  it("a user CANNOT write a row for another user (WITH CHECK denies)", async () => {
    await expect(
      asApp(A.profileId, async (tx) => {
        await tx`insert into device_push_tokens (user_id, token, platform) values (${B.profileId}, 'ExponentPushToken[spoof]', 'ios')`;
      }),
    ).rejects.toThrow();
  });

  it("the UNIQUE(user_id, token) upsert is idempotent", async () => {
    await asApp(A.profileId, async (tx) => {
      for (const plat of ["ios", "android"]) {
        await tx`
          insert into device_push_tokens (user_id, token, platform)
          values (${A.profileId}, 'ExponentPushToken[A]', ${plat})
          on conflict (user_id, token) do update set platform = excluded.platform, updated_at = now()
        `;
      }
      const rows = await tx`select token, platform from device_push_tokens`;
      expect(rows.length).toBe(1);
      expect(rows[0].platform).toBe("android"); // updated, not duplicated
    });
  });
});

describe("DEFINER readers cross the owner boundary (the send-hook path)", () => {
  it("app_recipient_push_tokens resolves ANOTHER user's tokens as the actor", async () => {
    // Seed B's token as B.
    await asApp(B.profileId, async (tx) => {
      await tx`insert into device_push_tokens (user_id, token, platform) values (${B.profileId}, 'ExponentPushToken[B]', 'ios')`;
    });
    // A (the actor) resolves B's (the recipient's) tokens via the DEFINER reader —
    // even though A's own-row RLS could never SELECT B's row directly.
    await asApp(A.profileId, async (tx) => {
      const direct = await tx`select token from device_push_tokens where user_id = ${B.profileId}`;
      expect(direct.length).toBe(0); // RLS hides B's row from A
      const viaDefiner = await tx`select token, platform from app_recipient_push_tokens(${B.profileId})`;
      expect(viaDefiner.map((r: any) => r.token)).toEqual(["ExponentPushToken[B]"]);
    });
  });

  it("app_notification_pref_enabled reads the recipient's pref; NULL when absent", async () => {
    await raw`insert into notification_prefs (user_id, category, enabled) values (${B.profileId}, 'walk_requests', false)`;
    await asApp(A.profileId, async (tx) => {
      const off = await tx`select app_notification_pref_enabled(${B.profileId}, 'walk_requests') as enabled`;
      expect(off[0].enabled).toBe(false);
      const absent = await tx`select app_notification_pref_enabled(${B.profileId}, 'biz_review') as enabled`;
      expect(absent[0].enabled).toBeNull();
    });
  });

  it("app_recipient_locale reads the recipient's stored locale", async () => {
    await raw`update user_profiles set preferred_locale = 'en' where id = ${B.profileId}`;
    await asApp(A.profileId, async (tx) => {
      const loc = await tx`select app_recipient_locale(${B.profileId}) as locale`;
      expect(loc[0].locale).toBe("en");
    });
  });
});
