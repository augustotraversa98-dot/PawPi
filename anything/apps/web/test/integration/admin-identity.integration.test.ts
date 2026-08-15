// MOD1 PR1 (migration 0114) — admin identity, proven on the REAL tables AS pawpi_app.
//   app_is_admin()          — honors BOTH role='admin' (legacy, backward compatible) AND the
//                             new user_profiles.is_admin flag; neither → false.
//   app_admin_recipients()  — DEFINER reader returning (user_id, email) for every non-banned
//                             admin, readable from ANY caller's identity (the report route runs
//                             in the reporter's identity, which cannot SELECT other profiles).
//
// Pattern mirrors ugc-moderation.integration: a raw superuser client seeds; a second porsager
// client AS pawpi_app (NOBYPASSRLS) runs every assertion inside a per-tx identity stamp.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

const LEGACY = { authUserId: 1, profileId: 1, username: 'legacyadmin', petId: 1, petName: 'Rex' };  // role='admin'
const FLAG   = { authUserId: 2, profileId: 2, username: 'flagadmin',   petId: 2, petName: 'Bella' }; // is_admin=true
const PLAIN  = { authUserId: 3, profileId: 3, username: 'plainuser',   petId: 3, petName: 'Coco' };  // neither
const BANNED = { authUserId: 4, profileId: 4, username: 'bannedadmin', petId: 4, petName: 'Duke' };  // is_admin but banned

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

beforeEach(async () => {
  await seedOwnerWithPet(raw, LEGACY);
  await seedOwnerWithPet(raw, FLAG);
  await seedOwnerWithPet(raw, PLAIN);
  await seedOwnerWithPet(raw, BANNED);
  await raw`update user_profiles set role = 'admin' where id = ${LEGACY.profileId}`;
  await raw`update user_profiles set is_admin = true where id = ${FLAG.profileId}`;
  await raw`update user_profiles set is_admin = true, banned_at = now() where id = ${BANNED.profileId}`;
});

describe('app_is_admin() (as pawpi_app)', () => {
  it('a legacy role=admin user is admin (backward compatible)', async () => {
    const [{ is }] = await asApp(LEGACY.profileId, (tx) => tx`select app_is_admin() as is`);
    expect(is).toBe(true);
  });

  it('a user with is_admin=true is admin (new flag)', async () => {
    const [{ is }] = await asApp(FLAG.profileId, (tx) => tx`select app_is_admin() as is`);
    expect(is).toBe(true);
  });

  it('a user with neither is NOT admin', async () => {
    const [{ is }] = await asApp(PLAIN.profileId, (tx) => tx`select app_is_admin() as is`);
    expect(is).toBe(false);
  });

  it('an anonymous (no identity) caller is NOT admin', async () => {
    const [{ is }] = await asApp(null, (tx) => tx`select app_is_admin() as is`);
    expect(is).toBe(false);
  });
});

describe('app_admin_recipients() (as pawpi_app)', () => {
  it('returns every non-banned admin with email, from a NON-admin caller (DEFINER)', async () => {
    // Called in the plain user's identity — proves the reporter can enumerate admins it could
    // never SELECT directly under user_profiles FORCE RLS.
    const rows = await asApp(PLAIN.profileId, (tx) =>
      tx`select user_id, email from app_admin_recipients() order by user_id`,
    );
    const ids = rows.map((r: any) => r.user_id);
    expect(ids).toEqual([LEGACY.profileId, FLAG.profileId]); // BANNED excluded, PLAIN excluded
    const legacyRow = rows.find((r: any) => r.user_id === LEGACY.profileId);
    expect(legacyRow.email).toBe('legacyadmin@example.com');
  });
});
