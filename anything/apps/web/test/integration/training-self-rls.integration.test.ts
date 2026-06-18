// RLS for ticket 2.45 — DIY self-training progress — proven on the REAL table AS pawpi_app.
//
// 0048 adds training_progress_self (owner_user_id, pet_id, program_key, session_key, UNIQUE
// per owner+pet+session) with OWNER-SCOPED FOR ALL RLS: the owner reads + writes ONLY their
// own rows; everyone else sees zero. DISTINCT from 2.10's provider training tables.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedOwnerWithPet,
  seedSelfTrainingProgress,
} from './db';

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };

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
    host: url.hostname,
    port: Number(url.port),
    database: url.pathname.replace(/^\//, ''),
    username: 'pawpi_app',
    password: 'pawpi_app',
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

// A has completed one session for their pet.
beforeEach(async () => {
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  await seedSelfTrainingProgress(raw, { id: 1, ownerUserId: A.profileId, petId: A.petId });
});

describe('RLS 2.45 — training_progress_self (as pawpi_app)', () => {
  it('the owner (A) reads their own completion; B sees ZERO', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(ids(await tx`select id from training_progress_self`)).toEqual([1]);
    });
    await asApp(B.profileId, async (tx) => {
      expect(await tx`select id from training_progress_self`).toHaveLength(0);
    });
  });

  it('no identity → zero (deny-by-default)', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from training_progress_self`).toHaveLength(0);
    });
  });

  it('the owner inserts their own completion (WITH CHECK passes)', async () => {
    // Explicit id: the seeded row used an explicit id (the PawPi sequence gotcha), so an
    // auto-id insert would collide on the pkey.
    const created = await asApp(A.profileId, (tx) => tx`
      insert into training_progress_self (id, owner_user_id, pet_id, program_key, session_key)
      values (99, ${A.profileId}, ${A.petId}, 'leash-manners', 'be-a-tree')
      returning id, owner_user_id`);
    expect(created).toHaveLength(1);
    expect(created[0].owner_user_id).toBe(A.profileId);
  });

  it('B cannot forge a completion attributed to A (WITH CHECK reject)', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`
        insert into training_progress_self (owner_user_id, pet_id, program_key, session_key)
        values (${A.profileId}, ${A.petId}, 'tricks', 'spin')`),
    ).rejects.toThrow(/row-level security/i);
  });

  it("B updates/deletes ZERO of A's rows; A can delete their own", async () => {
    await asApp(B.profileId, async (tx) => {
      expect(await tx`delete from training_progress_self returning id`).toHaveLength(0);
    });
    const [{ n }] = await raw`select count(*)::int as n from training_progress_self`;
    expect(n).toBe(1);

    await asApp(A.profileId, async (tx) => {
      expect(await tx`delete from training_progress_self returning id`).toHaveLength(1);
    });
  });

  it('the UNIQUE constraint makes a duplicate completion idempotent via ON CONFLICT', async () => {
    await asApp(A.profileId, async (tx) => {
      // same (owner,pet,program,session) as the seeded row → no-op, no error.
      const r = await tx`
        insert into training_progress_self (owner_user_id, pet_id, program_key, session_key)
        values (${A.profileId}, ${A.petId}, 'basic-obedience', 'sit')
        on conflict (owner_user_id, pet_id, program_key, session_key) do nothing
        returning id`;
      expect(r).toHaveLength(0); // conflict → nothing inserted
    });
    const [{ n }] = await raw`select count(*)::int as n from training_progress_self`;
    expect(n).toBe(1);
  });
});
