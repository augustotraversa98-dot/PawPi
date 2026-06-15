// Identity-chain + owner-scoping round-trip against a REAL Postgres (RLS R0).
//
// Seeds two owners through the real chain (auth_users -> user_profiles -> pets)
// each with their own pet and rows, then proves an owner-scoped SELECT returns
// ONLY that owner's data. This is the app-layer truth that RLS (R1/R2) will
// later enforce inside the database itself — here we pin the seed + query path
// against the real schema so the harness and fixtures are trustworthy.

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

let sql: Sql;

beforeAll(() => {
  sql = makeTestSql();
});

afterAll(async () => {
  await sql.end();
});

afterEach(async () => {
  await resetDb(sql);
});

describe('owner scoping round-trip (real Postgres)', () => {
  it('seeds the real identity chain: owner key is the profile id, not the auth id', async () => {
    const alice = await seedOwnerWithPet(sql, {
      authUserId: 42,
      profileId: 7,
      username: 'alice',
      petId: 1,
      petName: 'Rex',
    });

    // pets.owner_user_id must equal user_profiles.id (7), NOT auth_users.id (42).
    const [pet] = await sql<{ owner_user_id: number; auth_user_id: number }[]>`
      select p.owner_user_id, up.auth_user_id
      from pets p
      join user_profiles up on up.id = p.owner_user_id
      where p.id = ${alice.petId}
    `;
    expect(pet.owner_user_id).toBe(7);
    expect(pet.auth_user_id).toBe(42);
    expect(pet.owner_user_id).not.toBe(pet.auth_user_id);
  });

  it('an owner-scoped SELECT returns only that owner’s rows', async () => {
    const alice = await seedOwnerWithPet(sql, {
      authUserId: 42,
      profileId: 7,
      username: 'alice',
      petId: 1,
      petName: 'Rex',
    });
    const bob = await seedOwnerWithPet(sql, {
      authUserId: 99,
      profileId: 8,
      username: 'bob',
      petId: 2,
      petName: 'Fido',
    });

    // Each owner posts about their own pet (a representative pet-scoped table).
    await sql`
      insert into posts (user_id, pet_id, caption)
      values (${alice.ownerUserId}, ${alice.petId}, 'alice post 1'),
             (${alice.ownerUserId}, ${alice.petId}, 'alice post 2')
    `;
    await sql`
      insert into posts (user_id, pet_id, caption)
      values (${bob.ownerUserId}, ${bob.petId}, 'bob post 1')
    `;

    // The query app routes run: scope by owner_user_id (the profile id).
    const aliceRows = await sql<{ caption: string; pet_id: number }[]>`
      select caption, pet_id from posts where user_id = ${alice.ownerUserId}
    `;
    expect(aliceRows).toHaveLength(2);
    expect(aliceRows.map((r) => r.caption).sort()).toEqual([
      'alice post 1',
      'alice post 2',
    ]);
    expect(aliceRows.every((r) => r.pet_id === alice.petId)).toBe(true);

    const bobRows = await sql<{ caption: string }[]>`
      select caption from posts where user_id = ${bob.ownerUserId}
    `;
    expect(bobRows).toHaveLength(1);
    expect(bobRows[0].caption).toBe('bob post 1');

    // Cross-owner isolation: alice's scope never sees bob's data and vice versa.
    expect(aliceRows.some((r) => r.caption.startsWith('bob'))).toBe(false);
  });

  it('pet-scoped reads do not leak across pets', async () => {
    const alice = await seedOwnerWithPet(sql, {
      authUserId: 42,
      profileId: 7,
      username: 'alice',
      petId: 1,
      petName: 'Rex',
    });
    const bob = await seedOwnerWithPet(sql, {
      authUserId: 99,
      profileId: 8,
      username: 'bob',
      petId: 2,
      petName: 'Fido',
    });

    await sql`
      insert into routines (pet_id, owner_user_id, routine_type, title)
      values (${alice.petId}, ${alice.ownerUserId}, 'feeding', 'Rex breakfast'),
             (${bob.petId}, ${bob.ownerUserId}, 'feeding', 'Fido breakfast')
    `;

    const rexRoutines = await sql<{ title: string; pet_id: number }[]>`
      select title, pet_id from routines where pet_id = ${alice.petId}
    `;
    expect(rexRoutines).toHaveLength(1);
    expect(rexRoutines[0].title).toBe('Rex breakfast');
    expect(rexRoutines[0].pet_id).toBe(alice.petId);
  });
});
