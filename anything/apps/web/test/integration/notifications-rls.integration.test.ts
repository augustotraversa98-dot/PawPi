// RLS for notifications (ticket 2.26), proven on the REAL table acting AS pawpi_app.
//
// Owner-scoped: the RECIPIENT reads + marks their own rows. Cross-user inserts (an actor
// creating a notification for a different recipient) are impossible via a recipient-keyed
// policy, so there is NO INSERT policy — inserts go ONLY through the app_notify() SECURITY
// DEFINER helper, which runs as its owner and bypasses the row policy. We prove: recipient
// reads own / others read zero; recipient marks own read / non-recipient affects zero; a
// direct pawpi_app INSERT is denied; app_notify inserts for a recipient the actor is not;
// app_notify no-ops on self.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedUser } from "./db";

const A = { authUserId: 1, profileId: 1, username: "ua" }; // recipient
const B = { authUserId: 2, profileId: 2, username: "ub" }; // actor / other
const C = { authUserId: 3, profileId: 3, username: "uc" }; // unrelated

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? "" : String(userId)}, true)`;
    return fn(tx);
  });
}

const ids = (rows: any[]) => rows.map((r: any) => r.id).sort((a, b) => a - b);

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
  for (const u of [A, B, C]) await seedUser(raw, u);
});

describe("notifications RLS (as pawpi_app)", () => {
  it("the recipient reads ONLY their own; others (and no identity) read zero", async () => {
    await raw`insert into notifications (id, recipient_user_id, actor_user_id, type, subject_ref, body)
              values (100, ${A.profileId}, ${B.profileId}, 'paw', '5', 'pawed your post')`;
    await raw`select setval(pg_get_serial_sequence('notifications','id'), (select max(id) from notifications))`;

    await asApp(A.profileId, async (tx) => {
      expect(ids(await tx`select id from notifications`)).toEqual([100]);
    });
    await asApp(B.profileId, async (tx) => {
      expect(await tx`select id from notifications`).toHaveLength(0);
    });
    await asApp(null, async (tx) => {
      expect(await tx`select id from notifications`).toHaveLength(0);
    });
  });

  it("the recipient marks own read; a non-recipient update affects ZERO rows", async () => {
    await raw`insert into notifications (id, recipient_user_id, actor_user_id, type)
              values (101, ${A.profileId}, ${B.profileId}, 'bark')`;
    await raw`select setval(pg_get_serial_sequence('notifications','id'), (select max(id) from notifications))`;

    await asApp(B.profileId, async (tx) => {
      expect(
        await tx`update notifications set read_at = now() where id = 101 returning id`,
      ).toHaveLength(0);
    });
    await asApp(A.profileId, async (tx) => {
      expect(
        await tx`update notifications set read_at = now() where id = 101 returning id`,
      ).toHaveLength(1);
    });
  });

  it("a direct pawpi_app INSERT is denied (no INSERT policy under FORCE RLS)", async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`
        insert into notifications (recipient_user_id, actor_user_id, type)
        values (${A.profileId}, ${B.profileId}, 'follow')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it("app_notify (DEFINER) lets the actor create a notification for a DIFFERENT recipient", async () => {
    const created = await asApp(B.profileId, (tx) =>
      tx`select app_notify(${A.profileId}, ${B.profileId}, 'follow', '9', 'started following your pet') as id`,
    );
    expect(created[0].id).not.toBeNull();

    // The recipient (A) sees it; the actor (B) does not (B is not the recipient).
    await asApp(A.profileId, async (tx) => {
      const rows = await tx`select recipient_user_id, actor_user_id, type from notifications`;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        recipient_user_id: A.profileId,
        actor_user_id: B.profileId,
        type: "follow",
      });
    });
    await asApp(B.profileId, async (tx) => {
      expect(await tx`select id from notifications`).toHaveLength(0);
    });
  });

  it("app_notify no-ops on self (recipient = actor): returns null, inserts nothing", async () => {
    const r = await asApp(A.profileId, (tx) =>
      tx`select app_notify(${A.profileId}, ${A.profileId}, 'paw', '1', 'x') as id`,
    );
    expect(r[0].id).toBeNull();
    const [{ n }] = await raw`select count(*)::int as n from notifications`;
    expect(n).toBe(0);
  });
});
