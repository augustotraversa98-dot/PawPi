// RLS for owner↔owner DMs (ticket 2.27), proven on the REAL tables AS pawpi_app.
// Participant-scoped (mirrors 0031): a thread + its messages are visible/writable to the
// two participants only; a message's sender must BE the caller AND a participant.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inject } from "vitest";
import postgres from "postgres";
import type { Sql } from "postgres";
import { makeTestSql, resetDb, seedUser } from "./db";

const A = { authUserId: 1, profileId: 1, username: "ua" };
const B = { authUserId: 2, profileId: 2, username: "ub" };
const C = { authUserId: 3, profileId: 3, username: "uc" }; // outsider

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
  // One DM thread between A(1) and B(2), normalized a<b. One message from B.
  await raw`insert into dm_threads (id, user_a_id, user_b_id) values (200, ${A.profileId}, ${B.profileId})`;
  await raw`insert into dm_messages (id, thread_id, sender_user_id, body) values (300, 200, ${B.profileId}, 'hi from B')`;
  await raw`select setval(pg_get_serial_sequence('dm_threads','id'), (select max(id) from dm_threads))`;
  await raw`select setval(pg_get_serial_sequence('dm_messages','id'), (select max(id) from dm_messages))`;
});

describe("dm_threads RLS (as pawpi_app)", () => {
  it("both participants see the thread; an outsider and no-identity see ZERO", async () => {
    await asApp(A.profileId, async (tx) =>
      expect(ids(await tx`select id from dm_threads`)).toEqual([200]),
    );
    await asApp(B.profileId, async (tx) =>
      expect(ids(await tx`select id from dm_threads`)).toEqual([200]),
    );
    await asApp(C.profileId, async (tx) =>
      expect(await tx`select id from dm_threads`).toHaveLength(0),
    );
    await asApp(null, async (tx) =>
      expect(await tx`select id from dm_threads`).toHaveLength(0),
    );
  });

  it("a participant can create a thread that includes them; an outsider pair is rejected", async () => {
    // A starts a thread with C (pair 1,3) — A is a participant → allowed.
    await asApp(A.profileId, async (tx) => {
      const created = await tx`
        insert into dm_threads (user_a_id, user_b_id) values (${A.profileId}, ${C.profileId}) returning id
      `;
      expect(created).toHaveLength(1);
    });
    // C tries to forge a thread between A and B (C not a participant) → rejected.
    await expect(
      asApp(C.profileId, (tx) => tx`
        insert into dm_threads (user_a_id, user_b_id) values (${A.profileId}, ${B.profileId})
      `),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("dm_messages RLS (as pawpi_app)", () => {
  it("participants read the thread's messages; an outsider reads ZERO", async () => {
    await asApp(A.profileId, async (tx) =>
      expect(ids(await tx`select id from dm_messages`)).toEqual([300]),
    );
    await asApp(C.profileId, async (tx) =>
      expect(await tx`select id from dm_messages`).toHaveLength(0),
    );
  });

  it("a participant posts AS themselves; can't post as another / into a foreign thread", async () => {
    await asApp(A.profileId, async (tx) => {
      const m = await tx`
        insert into dm_messages (thread_id, sender_user_id, body)
        values (200, ${A.profileId}, 'hi from A') returning id
      `;
      expect(m).toHaveLength(1);
    });
    // A can't post AS B (sender must be the caller).
    await expect(
      asApp(A.profileId, (tx) => tx`
        insert into dm_messages (thread_id, sender_user_id, body)
        values (200, ${B.profileId}, 'forged')
      `),
    ).rejects.toThrow(/row-level security/i);
    // C can't post into a thread they're not in.
    await expect(
      asApp(C.profileId, (tx) => tx`
        insert into dm_messages (thread_id, sender_user_id, body)
        values (200, ${C.profileId}, 'intrusion')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it("the recipient marks the other side's message read; an outsider affects ZERO", async () => {
    await asApp(A.profileId, async (tx) => {
      const upd = await tx`
        update dm_messages set read_at = now()
        where thread_id = 200 and sender_user_id <> ${A.profileId} and read_at is null
        returning id
      `;
      expect(upd).toHaveLength(1); // message 300 (from B)
    });
    await asApp(C.profileId, async (tx) => {
      expect(
        await tx`update dm_messages set read_at = now() where id = 300 returning id`,
      ).toHaveLength(0);
    });
  });

  it("app_is_dm_participant resolves under FORCE RLS", async () => {
    await asApp(A.profileId, async (tx) =>
      expect((await tx`select app_is_dm_participant(200) as v`)[0].v).toBe(true),
    );
    await asApp(C.profileId, async (tx) =>
      expect((await tx`select app_is_dm_participant(200) as v`)[0].v).toBe(false),
    );
  });
});
