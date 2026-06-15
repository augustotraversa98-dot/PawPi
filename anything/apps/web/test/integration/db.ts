// Real-Postgres integration-test harness — test-side DB helpers (RLS R0 / Phase C).
//
// These run against a THROWAWAY embedded Postgres booted once per run by
// globalSetup.ts (NOT Supabase, NOT the app singleton in
// src/app/api/utils/sql.js). The connection string is published by globalSetup
// via Vitest's provide()/inject() seam and consumed here.
//
// NOTE: this module imports `vitest` (for inject) and so must only be imported
// from test files — never from globalSetup.ts (different context). The
// vitest-free migration runner lives in ./migrate.

import postgres from 'postgres';
import { inject } from 'vitest';
import type { Sql } from 'postgres';

export { MIGRATIONS_DIR, runMigrations } from './migrate';

/**
 * Open a test-only porsager client against the throwaway DB. Caller owns it and
 * must `await sql.end()` (do this in afterAll). max:1 keeps every statement on
 * one connection so TRUNCATE-based isolation is deterministic.
 */
export function makeTestSql(): Sql {
  const url = inject('TEST_DATABASE_URL');
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL was not provided — is test/integration/globalSetup.ts wired in vitest.integration.config.ts?',
    );
  }
  return postgres(url, { max: 1, onnotice: () => {} });
}

/**
 * Truncate every table in the public schema (RESTART IDENTITY CASCADE) for a
 * clean slate between tests. Generic on purpose — it discovers tables from the
 * catalog so new migrations need no maintenance here.
 */
export async function resetDb(sql: Sql): Promise<void> {
  const rows = await sql<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public'
  `;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename}"`).join(', ');
  await sql.unsafe(`truncate table ${list} restart identity cascade`);
}

/**
 * Seed the real identity chain for one owner:
 *   auth_users.id -> user_profiles.auth_user_id -> user_profiles.id (= owner key)
 *   -> pets.owner_user_id
 * Returns the ids the way app code threads them (owner key is the PROFILE id,
 * never the auth id — the bug class PawPi has hit repeatedly). Explicit ids keep
 * the chain readable in assertions; identity columns allow explicit inserts.
 */
export async function seedOwnerWithPet(
  sql: Sql,
  opts: {
    authUserId: number;
    profileId: number;
    username: string;
    petId: number;
    petName: string;
  },
): Promise<{ authUserId: number; ownerUserId: number; petId: number }> {
  const { authUserId, profileId, username, petId, petName } = opts;
  await sql`
    insert into auth_users (id, name, email)
    values (${authUserId}, ${username}, ${`${username}@example.com`})
  `;
  await sql`
    insert into user_profiles (id, auth_user_id, username, onboarding_completed)
    values (${profileId}, ${authUserId}, ${username}, true)
  `;
  await sql`
    insert into pets (id, owner_user_id, name, handle)
    values (${petId}, ${profileId}, ${petName}, ${username + '-' + petName.toLowerCase()})
  `;
  return { authUserId, ownerUserId: profileId, petId };
}
