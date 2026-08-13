// RLS for unit E0 (Pet Owner engagement foundations) — proven on the REAL tables AS pawpi_app.
//
// pet_care_days + pet_streaks: owner FOR ALL (owner_user_id = current_app_user_id()); every other
// user sees zero and cannot forge a row owned by someone else (WITH CHECK); no identity => deny.
// Plus: user_profiles.timezone is an additive nullable column and user_profiles keeps its own RLS.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

const OWNER = { authUserId: 1, profileId: 1, username: 'owner', petId: 1, petName: 'Rex' };
const OTHER = { authUserId: 2, profileId: 2, username: 'other', petId: 2, petName: 'Bella' };

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}
const ids = (rows: any[]) => rows.map((r: any) => r.id).sort((a, b) => a - b);

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL'));
  app = postgres({
    host: url.hostname, port: Number(url.port),
    database: url.pathname.replace(/^\//, ''),
    username: 'pawpi_app', password: 'pawpi_app', max: 1, onnotice: () => {},
  });
});
afterAll(async () => { await app.end(); await raw.end(); });
afterEach(async () => { await resetDb(raw); });

beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, OTHER);
});

describe('E0 — pet_care_days RLS', () => {
  it('owner inserts + reads their own care day', async () => {
    await asApp(OWNER.profileId, async (tx) => {
      const r = await tx`
        insert into pet_care_days (id, pet_id, owner_user_id, day, walk_done)
        values (10, ${OWNER.petId}, ${OWNER.profileId}, '2026-08-13', true) returning id`;
      expect(r).toHaveLength(1);
      expect(ids(await tx`select id from pet_care_days`)).toEqual([10]);
    });
  });

  it("another owner cannot see or edit someone else's care day", async () => {
    await raw`
      insert into pet_care_days (id, pet_id, owner_user_id, day)
      values (10, ${OWNER.petId}, ${OWNER.profileId}, '2026-08-13')`;
    await asApp(OTHER.profileId, async (tx) => {
      expect(await tx`select id from pet_care_days`).toHaveLength(0);
      expect(await tx`update pet_care_days set ring_closed = true returning id`).toHaveLength(0);
    });
  });

  it('no identity => zero (deny-by-default)', async () => {
    await raw`
      insert into pet_care_days (id, pet_id, owner_user_id, day)
      values (10, ${OWNER.petId}, ${OWNER.profileId}, '2026-08-13')`;
    await asApp(null, async (tx) => expect(await tx`select id from pet_care_days`).toHaveLength(0));
  });

  it("cannot forge a care day owned by someone else (WITH CHECK)", async () => {
    await expect(
      asApp(OTHER.profileId, (tx) => tx`
        insert into pet_care_days (pet_id, owner_user_id, day)
        values (${OWNER.petId}, ${OWNER.profileId}, '2026-08-13')`),
    ).rejects.toThrow(/row-level security/i);
  });

  it('UNIQUE(pet_id, day) makes the derived day idempotent', async () => {
    // First row committed in its own tx; the duplicate attempt in a separate tx so the
    // constraint abort can't poison an outer transaction.
    await asApp(OWNER.profileId, (tx) =>
      tx`insert into pet_care_days (pet_id, owner_user_id, day) values (${OWNER.petId}, ${OWNER.profileId}, '2026-08-13')`);
    await expect(
      asApp(OWNER.profileId, (tx) =>
        tx`insert into pet_care_days (pet_id, owner_user_id, day) values (${OWNER.petId}, ${OWNER.profileId}, '2026-08-13')`),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});

describe('E0 — pet_streaks RLS', () => {
  it('owner upserts + reads their own streak row', async () => {
    await asApp(OWNER.profileId, async (tx) => {
      const r = await tx`
        insert into pet_streaks (pet_id, owner_user_id, current_count, longest_count, last_closed_day)
        values (${OWNER.petId}, ${OWNER.profileId}, 3, 3, '2026-08-13') returning pet_id`;
      expect(r).toHaveLength(1);
      const [row] = await tx`select current_count, freezes_available from pet_streaks where pet_id = ${OWNER.petId}`;
      expect(row.current_count).toBe(3);
      expect(row.freezes_available).toBe(1); // default banked freeze
    });
  });

  it("another owner cannot see someone else's streak", async () => {
    await raw`insert into pet_streaks (pet_id, owner_user_id, current_count) values (${OWNER.petId}, ${OWNER.profileId}, 5)`;
    await asApp(OTHER.profileId, async (tx) =>
      expect(await tx`select pet_id from pet_streaks`).toHaveLength(0));
  });

  it("cannot forge a streak owned by someone else (WITH CHECK)", async () => {
    await expect(
      asApp(OTHER.profileId, (tx) => tx`
        insert into pet_streaks (pet_id, owner_user_id) values (${OWNER.petId}, ${OWNER.profileId})`),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('E0 — user_profiles.timezone (additive, no RLS change)', () => {
  it('timezone column exists and defaults to NULL (honest, no fake value)', async () => {
    const [col] = await raw`
      select column_name, is_nullable, column_default
      from information_schema.columns
      where table_schema='public' and table_name='user_profiles' and column_name='timezone'`;
    expect(col).toBeTruthy();
    expect(col.is_nullable).toBe('YES');
    expect(col.column_default).toBeNull();
    const [row] = await raw`select timezone from user_profiles where id = ${OWNER.profileId}`;
    expect(row.timezone).toBeNull();
  });
});
