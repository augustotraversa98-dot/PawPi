// The hand-applied migrations 0122-0125 (emergency tag least-privilege, owner care-grant INSERT, provider
// seed + claim) shipped without a supabase/verify_NNNN.sql. These tests run each verify script against the
// real harness schema (every migration applied) and require EVERY row to read PASS — the same contract the
// human relies on when running them in the Supabase SQL editor. A verify script that is wrong (or a
// migration that drifts from it) fails CI here, naming the check.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { makeTestSql } from './db';
import { MIGRATIONS_DIR } from './migrate';

let raw: Sql;
beforeAll(() => {
  raw = makeTestSql();
});
afterAll(async () => {
  await raw.end();
});

const verifySql = (n: string) => readFileSync(join(MIGRATIONS_DIR, '..', `verify_${n}.sql`), 'utf8');

describe.each(['0122', '0123', '0124', '0125'])('verify_%s.sql', (n) => {
  it('every row reads PASS on the harness schema', async () => {
    const rows = await raw.unsafe<{ ord: number; check_name: string; detail: string; status: string }[]>(verifySql(n));
    expect(rows.length).toBeGreaterThanOrEqual(5);
    const failing = rows.filter((r) => r.status !== 'PASS').map((r) => `${r.ord} ${r.check_name} -> ${r.detail}`);
    expect(failing, `verify_${n}.sql rows not PASS:\n${failing.join('\n')}`).toEqual([]);
  });
});

describe('the verify scripts can actually fail', () => {
  it('verify_0123 flags the pre-0123 policy (provider branch only) — rolled back afterwards', async () => {
    const ROLLBACK = new Error('rollback');
    let failing: string[] = [];
    await raw
      .begin(async (tx) => {
        await tx.unsafe('drop policy care_access_grants_insert on care_access_grants');
        await tx.unsafe(
          `create policy care_access_grants_insert on care_access_grants for insert
             with check (app_is_active_staff_of(provider_id) and requested_by = 'provider')`,
        );
        const rows = await tx.unsafe<{ check_name: string; status: string }[]>(verifySql('0123'));
        failing = rows.filter((r) => r.status !== 'PASS').map((r) => r.check_name);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
    expect(failing.length).toBeGreaterThanOrEqual(2);
    expect(failing.join('|')).toMatch(/OWNER branch/);
    expect(failing.join('|')).toMatch(/pet ownership/);
  });

  it('verify_0122 flags a tag branch that leaks the vet phone — rolled back afterwards', async () => {
    const ROLLBACK = new Error('rollback');
    let failing: string[] = [];
    await raw
      .begin(async (tx) => {
        // simulate the pre-0122 assembler: tag branch includes vet_phone
        const [{ src }] = await tx.unsafe<{ src: string }[]>(
          `select prosrc as src from pg_proc where proname = 'app_emergency_card_json'
             and pg_get_function_identity_arguments(oid) like '%p_medical_scope text'`,
        );
        const leaky = src.replace(
          "'blood_type', c.blood_type,",
          "'blood_type', c.blood_type, 'vet_phone', mp.vet_phone,",
        );
        expect(leaky).not.toBe(src);
        await tx.unsafe(`create or replace function app_emergency_card_json(p_card_id integer, p_include_medical boolean, p_medical_scope text)
          returns jsonb language sql stable security definer set search_path = public, pg_temp as $f$${leaky}$f$`);
        const rows = await tx.unsafe<{ check_name: string; status: string }[]>(verifySql('0122'));
        failing = rows.filter((r) => r.status !== 'PASS').map((r) => r.check_name);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
    expect(failing.join('|')).toMatch(/tag branch/);
  });
});
