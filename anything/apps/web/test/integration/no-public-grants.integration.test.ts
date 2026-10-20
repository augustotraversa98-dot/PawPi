// No object a migration creates may be reachable from the Supabase Data API roles (anon / authenticated)
// or from PUBLIC. AUDIT_2026-09 A-01: Supabase's defaults hand EVERY new function EXECUTE-to-PUBLIC and
// (via default privileges) every new table/sequence/function to anon + authenticated, and PostgREST exposes
// schema public with the publishable key. 0126 revoked what existed then; the 12 notification-v2 functions
// added afterwards (0131 / 0132) came back executable — verify_0126 rows 2 and 8 failed on production.
//
// This test runs against the schema AFTER ALL MIGRATIONS (the harness applies every NNNN_*.sql) and fails,
// naming the offender, when a function / table / sequence in schema public is left reachable:
//   • a function whose ACL still has EXECUTE for PUBLIC (a brand-new function with no explicit REVOKE has a
//     NULL ACL = the Postgres default = PUBLIC may execute), or for anon / authenticated when those roles exist;
//   • a table / view / sequence granted to PUBLIC, anon or authenticated;
//   • a schema-public default privilege that would grant any of those on FUTURE objects;
//   • a function pawpi_app (the app role) cannot execute — the fix must never lock the app out.
// The fix for a new function is two lines in the migration (see supabase/migrations/TEMPLATE.sql §2):
//     revoke execute on function f(args) from public, anon, authenticated;
//     grant  execute on function f(args) to pawpi_app;
// (REVOKE ... FROM anon/authenticated when those roles do not exist is a hard error in Postgres, so the
//  template wraps it in the guarded DO block used by 0126 / 0134 — copy that.)
// Extension-owned objects (pg_depend 'e') are excluded: they are not ours to re-ACL.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

describe('no migration leaves an object reachable from PUBLIC / anon / authenticated', () => {
  it('no function in schema public is executable by PUBLIC, anon or authenticated', async () => {
    const rows = await raw<{ signature: string; grantee: string }[]>`
      select p.oid::regprocedure::text as signature,
             case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as grantee
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.pronamespace = 'public'::regnamespace
        and a.privilege_type = 'EXECUTE'
        and (a.grantee = 0
             or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      order by 1
    `;
    expect(
      rows,
      'these functions are executable by PUBLIC/anon/authenticated (add the revoke+grant pair from ' +
        'supabase/migrations/TEMPLATE.sql §2 to the migration that created them):\n' +
        rows.map((r) => `${r.signature} -> ${r.grantee}`).join('\n'),
    ).toEqual([]);
  });

  it('pawpi_app can execute every function in schema public (the revoke never locks the app out)', async () => {
    const rows = await raw<{ signature: string }[]>`
      select p.oid::regprocedure::text as signature
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and not has_function_privilege('pawpi_app', p.oid, 'EXECUTE')
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      order by 1
    `;
    expect(rows.map((r) => r.signature), 'pawpi_app cannot execute these').toEqual([]);
  });

  it('no table, view or sequence in schema public is granted to PUBLIC, anon or authenticated', async () => {
    const rows = await raw<{ name: string; grantee: string; privilege: string }[]>`
      select c.oid::regclass::text as name,
             case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as grantee,
             a.privilege_type as privilege
      from pg_class c
      cross join lateral aclexplode(c.relacl) a
      where c.relnamespace = 'public'::regnamespace
        and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
        and (a.grantee = 0
             or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))
      order by 1, 2, 3
    `;
    expect(
      rows,
      'these relations are granted to PUBLIC/anon/authenticated:\n' +
        rows.map((r) => `${r.name} ${r.privilege} -> ${r.grantee}`).join('\n'),
    ).toEqual([]);
  });

  it('no default privilege in schema public grants future objects to PUBLIC, anon or authenticated', async () => {
    const rows = await raw<{ owner: string; objtype: string; grantee: string }[]>`
      select d.defaclrole::regrole::text as owner, d.defaclobjtype::text as objtype,
             case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as grantee
      from pg_default_acl d
      cross join lateral aclexplode(d.defaclacl) a
      where d.defaclnamespace = 'public'::regnamespace
        and (a.grantee = 0
             or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated')))
    `;
    expect(rows, 'default privileges that would re-open future objects').toEqual([]);
  });
});

describe('the guard itself', () => {
  it('catches a new function and a new table that a migration forgot to lock down — rolled back afterwards', async () => {
    const ROLLBACK = new Error('rollback');
    let fnOffenders: string[] = [];
    let tableOffenders: string[] = [];
    await raw
      .begin(async (tx) => {
        await tx.unsafe('create function app_leaky_helper() returns integer language sql as $f$ select 1 $f$');
        await tx.unsafe('create table leaky_widgets (id integer)');
        await tx.unsafe('grant select on leaky_widgets to public');
        fnOffenders = (
          await tx<{ signature: string }[]>`
            select p.oid::regprocedure::text as signature
            from pg_proc p
            cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where p.pronamespace = 'public'::regnamespace and a.privilege_type = 'EXECUTE' and a.grantee = 0`
        ).map((r) => r.signature);
        tableOffenders = (
          await tx<{ name: string }[]>`
            select c.oid::regclass::text as name from pg_class c
            cross join lateral aclexplode(c.relacl) a
            where c.relnamespace = 'public'::regnamespace and a.grantee = 0`
        ).map((r) => r.name);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
    expect(fnOffenders).toContain('app_leaky_helper()');
    expect(tableOffenders).toContain('leaky_widgets');
  });
});

describe('the documented fix really works', () => {
  it('the revoke+grant pair copied from TEMPLATE.sql §2 leaves a new function clean', async () => {
    const ROLLBACK = new Error('rollback');
    const template = readFileSync(join(MIGRATIONS_DIR, 'TEMPLATE.sql'), 'utf8');
    // lift the REQUIRED revoke/DO/grant block for app_example_helper out of the template itself
    const start = template.indexOf('revoke execute on function app_example_helper(integer) from public;');
    const end = template.indexOf('grant execute on function app_example_helper(integer) to pawpi_app;');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const block = template.slice(start, end + 'grant execute on function app_example_helper(integer) to pawpi_app;'.length);
    let offenders: string[] = [];
    let appCanRun = false;
    await raw
      .begin(async (tx) => {
        await tx.unsafe('create function app_example_helper(p integer) returns boolean language sql as $f$ select true $f$');
        await tx.unsafe(block);
        offenders = (
          await tx<{ signature: string }[]>`
            select p.oid::regprocedure::text as signature
            from pg_proc p
            cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where p.proname = 'app_example_helper' and a.privilege_type = 'EXECUTE' and a.grantee = 0`
        ).map((r) => r.signature);
        const [{ ok }] = await tx<{ ok: boolean }[]>`select has_function_privilege('pawpi_app', 'app_example_helper(integer)', 'EXECUTE') as ok`;
        appCanRun = ok;
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
    expect(offenders).toEqual([]);
    expect(appCanRun).toBe(true);
  });

  it('migration 0134 is idempotent (re-applying it changes nothing and does not error)', async () => {
    const ROLLBACK = new Error('rollback');
    const sqlText = readFileSync(join(MIGRATIONS_DIR, '0134_revoke_public_execute_sweep.sql'), 'utf8');
    await raw
      .begin(async (tx) => {
        await tx.unsafe(sqlText);
        await tx.unsafe(sqlText);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  });
});
