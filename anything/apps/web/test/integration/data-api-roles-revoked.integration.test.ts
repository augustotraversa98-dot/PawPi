// Migration 0126 (AUDIT_2026-09 A-01 / A-32) — proven on REAL Postgres.
//
// The embedded harness has no Supabase `anon` / `authenticated` roles, so the migration is a
// guarded no-op there. This test creates the two roles with Supabase's default blanket grants,
// re-applies 0126 (idempotent), and proves: every table / routine privilege is gone for both
// roles, the RLS-exempt identity tables are no longer readable by them, and the app's own role
// (pawpi_app) keeps everything it had. It also pins the search_path fix on current_app_user_id.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Sql } from 'postgres';
import { MIGRATIONS_DIR, makeTestSql } from './db';

const ROLES = ['anon', 'authenticated'] as const;
const MIGRATION = '0126_revoke_data_api_roles.sql';

let raw: Sql;

async function grantCount(role: string): Promise<number> {
  const [{ n }] = await raw<{ n: number }[]>`
    select count(*)::int as n
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee = ${role}`;
  return n;
}

async function executableFunctions(role: string): Promise<number> {
  const [{ n }] = await raw<{ n: number }[]>`
    select count(*)::int as n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and has_function_privilege(${role}, p.oid, 'EXECUTE')`;
  return n;
}

beforeAll(async () => {
  raw = makeTestSql();
  for (const role of ROLES) {
    await raw.unsafe(`create role ${role} nologin`);
    // Supabase's platform defaults, reproduced.
    await raw.unsafe(`grant usage on schema public to ${role}`);
    await raw.unsafe(`grant all privileges on all tables in schema public to ${role}`);
    await raw.unsafe(`grant all privileges on all sequences in schema public to ${role}`);
    await raw.unsafe(`grant all privileges on all routines in schema public to ${role}`);
  }
});

afterAll(async () => {
  for (const role of ROLES) {
    await raw.unsafe(`drop owned by ${role}`);
    await raw.unsafe(`drop role ${role}`);
  }
  await raw.end();
});

describe('0126 — Data-API roles revoked', () => {
  it('starts from the Supabase default: both roles hold blanket grants', async () => {
    for (const role of ROLES) {
      expect(await grantCount(role)).toBeGreaterThan(50);
      expect(await executableFunctions(role)).toBeGreaterThan(20);
      expect(
        (await raw`select has_table_privilege(${role}, 'public.auth_users', 'SELECT') as ok`)[0].ok,
      ).toBe(true);
    }
  });

  it('re-applying the migration strips every table, sequence and routine privilege', async () => {
    await raw.unsafe(await readFile(path.join(MIGRATIONS_DIR, MIGRATION), 'utf8'));

    for (const role of ROLES) {
      expect(await grantCount(role)).toBe(0);
      expect(await executableFunctions(role)).toBe(0);
      for (const table of ['auth_users', 'auth_sessions', 'user_profiles', 'pets']) {
        const [{ ok }] = await raw`select has_table_privilege(${role}, ${'public.' + table}, 'SELECT') as ok`;
        expect(ok, `${role} must not read ${table}`).toBe(false);
      }
      const [{ ok: seq }] = await raw`
        select bool_or(has_sequence_privilege(${role}, c.oid, 'USAGE')) as ok
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'S'`;
      expect(seq).toBe(false);
    }
  });

  it('is idempotent', async () => {
    await raw.unsafe(await readFile(path.join(MIGRATIONS_DIR, MIGRATION), 'utf8'));
    expect(await grantCount('anon')).toBe(0);
  });

  it('leaves the app role untouched (and able to execute every public routine)', async () => {
    const [{ pets, helper }] = await raw`
      select has_table_privilege('pawpi_app', 'public.pets', 'SELECT') as pets,
             has_function_privilege('pawpi_app', 'public.current_app_user_id()', 'EXECUTE') as helper`;
    expect(pets).toBe(true);
    expect(helper).toBe(true);
    const [{ n }] = await raw<{ n: number }[]>`
      select count(*)::int as n
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public' and not has_function_privilege('pawpi_app', p.oid, 'EXECUTE')`;
    expect(n).toBe(0);
  });

  it('pins the search_path of current_app_user_id()', async () => {
    const [{ config }] = await raw`
      select array_to_string(p.proconfig, ',') as config
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'current_app_user_id'`;
    expect(config).toContain('search_path=public');
  });
});
