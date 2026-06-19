// Ticket 2.78 — in-app ACCOUNT DELETION, proven on the REAL tables AS pawpi_app (Apple 5.1.1(v)).
//
// delete_my_account() (0062) irreversibly removes the CALLER's account + all owner-scoped data: the
// auth_users delete cascades (auth → user_profiles → pets → health/social/etc.), the no-cascade
// health_medical_care_logs is cleared first, and ON DELETE SET NULL references on OTHER users' rows
// survive. It is inherently self-only (keys off current_app_user_id()).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Fido' };

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}

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
  await seedOwnerWithPet(raw, B);
  // A's owner-scoped data: a cascading health log + the NO-CASCADE medical-care log + a session.
  await raw`insert into health_food_logs (pet_id, owner_user_id) values (${A.petId}, ${A.profileId})`;
  await raw`insert into health_medical_care_logs (pet_id, owner_user_id, status) values (${A.petId}, ${A.profileId}, 'given')`;
  await raw`insert into auth_sessions (id, "userId", "sessionToken", expires) values (900, ${A.authUserId}, 'tok-a', now() + interval '1 day')`;
});

describe('delete_my_account', () => {
  it('irreversibly deletes the caller account + all owner-scoped data; another account is untouched', async () => {
    const [{ ok }] = await asApp(A.profileId, (tx) => tx`select delete_my_account() as ok`);
    expect(ok).toBe(true);

    // A is fully gone — auth, profile, pet, both health logs, session.
    expect((await raw`select id from auth_users where id = ${A.authUserId}`).length).toBe(0);
    expect((await raw`select id from user_profiles where id = ${A.profileId}`).length).toBe(0);
    expect((await raw`select id from pets where owner_user_id = ${A.profileId}`).length).toBe(0);
    expect((await raw`select id from health_food_logs where owner_user_id = ${A.profileId}`).length).toBe(0);
    expect((await raw`select id from health_medical_care_logs where owner_user_id = ${A.profileId}`).length).toBe(0);
    expect((await raw`select id from auth_sessions where "userId" = ${A.authUserId}`).length).toBe(0);

    // B is completely untouched.
    expect((await raw`select id from user_profiles where id = ${B.profileId}`).length).toBe(1);
    expect((await raw`select id from pets where owner_user_id = ${B.profileId}`).length).toBe(1);
  });

  it('is self-only: with no identity it deletes nothing', async () => {
    const [{ ok }] = await asApp(null, (tx) => tx`select delete_my_account() as ok`);
    expect(ok).toBe(false);
    expect((await raw`select id from user_profiles`).length).toBe(2); // both intact
  });

  it('deleting A does not touch B even when called as A', async () => {
    await asApp(A.profileId, (tx) => tx`select delete_my_account()`);
    expect((await raw`select id from auth_users where id = ${B.authUserId}`).length).toBe(1);
    expect((await raw`select id from pets where owner_user_id = ${B.profileId}`).length).toBe(1);
  });
});
