// Ticket 2.73 — pet-friendly places favorites, proven on the REAL tables AS pawpi_app.
//
// saved_places (0059) is owner-scoped FOR ALL (like training_progress_self): the owner reads/writes
// their own favorites; another user sees + touches ZERO. There is no cache table — the Google Places
// data is fetched live by the key-gated server proxy, so the only persisted row is an owner's save.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser } from './db';

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb' };

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
    host: url.hostname, port: Number(url.port), database: url.pathname.replace(/^\//, ''),
    username: 'pawpi_app', password: 'pawpi_app', max: 1, onnotice: () => {},
  });
});
afterAll(async () => { await app.end(); await raw.end(); });
afterEach(async () => { await resetDb(raw); });

beforeEach(async () => {
  await seedOwnerWithPet(raw, A);
  await seedUser(raw, B);
  await raw`
    insert into saved_places (id, owner_user_id, place_id, name, category, lat, lng)
    values (500, ${A.profileId}, 'g-1', 'Dog Park', 'park', 40.7, -74)
  `;
});

describe('saved_places owner RLS', () => {
  it('owner reads + saves own; another user + anon read ZERO', async () => {
    await asApp(A.profileId, async (tx) => expect(ids(await tx`select id from saved_places`)).toEqual([500]));
    await asApp(B.profileId, async (tx) => expect(await tx`select id from saved_places`).toHaveLength(0));
    await asApp(null, async (tx) => expect(await tx`select id from saved_places`).toHaveLength(0));
  });

  it('owner inserts a favorite for themselves', async () => {
    const created = await asApp(A.profileId, (tx) => tx`
      insert into saved_places (owner_user_id, place_id, name, category) values (${A.profileId}, 'g-2', 'Cafe', 'cafe') returning id
    `);
    expect(created).toHaveLength(1);
  });

  it('a user CANNOT save a favorite under another owner', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`
        insert into saved_places (owner_user_id, place_id, name) values (${A.profileId}, 'g-3', 'Forged')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('another user deletes ZERO of the owner\'s saves', async () => {
    await asApp(B.profileId, async (tx) => {
      expect(await tx`delete from saved_places where id = 500 returning id`).toHaveLength(0);
    });
    await asApp(A.profileId, async (tx) => {
      expect(await tx`delete from saved_places where id = 500 returning id`).toHaveLength(1);
    });
  });
});
