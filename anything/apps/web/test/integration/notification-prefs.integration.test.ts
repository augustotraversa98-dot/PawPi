// BX4 — server-side notification prefs + app_notify gating, proven on the REAL
// table acting AS pawpi_app (migration 0108).
//
// Proves:
//   • notification_prefs is own-row under FORCE RLS: a user reads/writes only their
//     own; another identity (and no identity) sees zero and cannot write for them.
//   • app_notify GATES a business category: recipient with walk_requests=false gets
//     NO notification row; enabled=true or ABSENT (fail-open) => the row is created.
//   • an OWNER-only type (paw) is never gated by a business pref.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedUser } from "./db";

const A = { authUserId: 1, profileId: 1, username: "ua" }; // recipient (a business)
const B = { authUserId: 2, profileId: 2, username: "ub" }; // actor / other

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? "" : String(userId)}, true)`;
    return fn(tx);
  });
}

const countNotifs = async () =>
  (await raw`select count(*)::int as n from notifications`)[0].n as number;

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
  for (const u of [A, B]) await seedUser(raw, u);
});

describe("notification_prefs RLS (as pawpi_app)", () => {
  it("a user reads + writes only their own pref; others read zero and cannot write for them", async () => {
    // A writes their own pref.
    await asApp(A.profileId, async (tx) => {
      await tx`insert into notification_prefs (user_id, category, enabled)
               values (${A.profileId}, 'walk_requests', false)`;
    });

    // A sees it; B (and no identity) see zero of A's rows.
    await asApp(A.profileId, async (tx) => {
      expect(await tx`select category from notification_prefs`).toHaveLength(1);
    });
    await asApp(B.profileId, async (tx) => {
      expect(await tx`select category from notification_prefs`).toHaveLength(0);
    });
    await asApp(null, async (tx) => {
      expect(await tx`select category from notification_prefs`).toHaveLength(0);
    });

    // B cannot forge a pref FOR A (WITH CHECK user_id = current identity).
    await expect(
      asApp(B.profileId, (tx) => tx`
        insert into notification_prefs (user_id, category, enabled)
        values (${A.profileId}, 'walk_requests', false)
      `),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("app_notify business-category gating (as pawpi_app)", () => {
  it("recipient with walk_requests DISABLED gets NO notification row", async () => {
    await asApp(A.profileId, async (tx) => {
      await tx`insert into notification_prefs (user_id, category, enabled)
               values (${A.profileId}, 'walk_requests', false)`;
    });

    const r = await asApp(B.profileId, (tx) =>
      tx`select app_notify(${A.profileId}, ${B.profileId}, 'walk_request_broadcast', '7', null) as id`,
    );
    expect(r[0].id).toBeNull();
    expect(await countNotifs()).toBe(0);
  });

  it("recipient with walk_requests ENABLED is notified", async () => {
    await asApp(A.profileId, async (tx) => {
      await tx`insert into notification_prefs (user_id, category, enabled)
               values (${A.profileId}, 'walk_requests', true)`;
    });

    const r = await asApp(B.profileId, (tx) =>
      tx`select app_notify(${A.profileId}, ${B.profileId}, 'walk_request_targeted', '7', null) as id`,
    );
    expect(r[0].id).not.toBeNull();
    expect(await countNotifs()).toBe(1);
  });

  it("fail-open: no pref row => the walk request is still delivered", async () => {
    const r = await asApp(B.profileId, (tx) =>
      tx`select app_notify(${A.profileId}, ${B.profileId}, 'walk_request_broadcast', '7', null) as id`,
    );
    expect(r[0].id).not.toBeNull();
    expect(await countNotifs()).toBe(1);
  });

  it("an owner-only type (paw) is NOT gated by a business pref set to false", async () => {
    await asApp(A.profileId, async (tx) => {
      await tx`insert into notification_prefs (user_id, category, enabled)
               values (${A.profileId}, 'walk_requests', false)`;
    });

    const r = await asApp(B.profileId, (tx) =>
      tx`select app_notify(${A.profileId}, ${B.profileId}, 'paw', '3', 'pawed your post') as id`,
    );
    expect(r[0].id).not.toBeNull();
    expect(await countNotifs()).toBe(1);
  });
});
