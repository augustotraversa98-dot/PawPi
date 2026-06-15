// RLS R1 — per-request DB identity, proven against a REAL Postgres.
//
// R1 adds the "SET LOCAL identity" plumbing: each request opens a transaction and
// stamps `app.current_user_id` (the caller's user_profiles.id) via
// set_config(..., true). NOTHING is enforced yet (no RLS policies on real tables,
// still the privileged role) — this suite proves the MECHANISM the enforcement
// ticket (R2) will build on:
//   1. readback     — the GUC is visible to every query in the same unit of work.
//   2. anti-leak     — it auto-resets at transaction end; the next use of the same
//                      pooled connection never sees the previous request's id.
//   3. proxy fidelity — tagged templates, sql.json and sql.unsafe all work THROUGH
//                      the request-aware `sql` proxy against real PG.
//   4. RLS capability — a throwaway FORCE-RLS table + non-owner role + a policy
//                      keyed on current_setting('app.current_user_id') returns ZERO
//                      cross-owner rows, proving this engine enforces what R2 needs.
//
// Unlike the other integration files (which use their own makeTestSql client), this
// one loads the ACTUAL app modules (utils/sql + utils/requestContext) so the real
// proxy + transaction wrapper are what's exercised. To do that it points the app at
// the embedded DB by setting DATABASE_URL (+ DATABASE_SSL=disable) BEFORE importing
// them — hence the dynamic import in beforeAll.

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

// current_setting(name, true) returns SQL NULL when a custom GUC has never been
// referenced, but '' (empty string) once the placeholder has been defined on a
// connection and then reset. Both mean "no identity" — the R2 policies key off
// nullif(current_setting(...), '') for exactly this reason.
const isUnset = (v: unknown) => v === null || v === '';

// The app's request-aware proxy + wrapper, loaded after env is pointed at embedded PG.
let sql: any;
let setCurrentUserId: (id: number | null) => Promise<void>;
let withTransaction: <T>(fn: (tx: Sql) => Promise<T>) => Promise<T>;

// A raw superuser client (no proxy) for seeding, reset, and the RLS smoke setup.
let raw: Sql;

beforeAll(async () => {
  const url = inject('TEST_DATABASE_URL');
  // Point the app singleton at the embedded DB before it is first imported.
  process.env.DATABASE_URL = url;
  process.env.DATABASE_SSL = 'disable';

  sql = (await import('@/app/api/utils/sql')).default;
  const ctx = await import('@/app/api/utils/requestContext');
  setCurrentUserId = ctx.setCurrentUserId;
  withTransaction = ctx.withTransaction as typeof withTransaction;

  raw = makeTestSql();
});

afterAll(async () => {
  await sql.end?.();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
});

describe('RLS R1 — set_config identity readback (real Postgres)', () => {
  it('within a wrapped unit of work the id is set, and a second query sees it too', async () => {
    const result = await withTransaction(async () => {
      await setCurrentUserId(7);

      // First query reads the GUC back.
      const [a] = await sql`
        select current_setting('app.current_user_id', true) as v
      `;
      // A SECOND, independent query in the SAME unit of work sees the same id —
      // proving every statement runs on one identity-carrying transaction.
      const [b] = await sql`
        select current_setting('app.current_user_id', true) as v
      `;
      return { a: a.v, b: b.v };
    });

    expect(result.a).toBe('7');
    expect(result.b).toBe('7');
  });

  it('without a request context the GUC is unset (current_setting returns null)', async () => {
    // No active transaction => the proxy talks to the global pool, where no
    // request identity has ever been set.
    const [row] = await sql`
      select current_setting('app.current_user_id', true) as v
    `;
    expect(isUnset(row.v)).toBe(true);
  });
});

describe('RLS R1 — anti-leak across requests on the pooled connection (critical)', () => {
  it('the id does NOT bleed into a later unit of work on the same pool', async () => {
    // Unit A sets identity 7 and confirms it.
    const seen = await withTransaction(async () => {
      await setCurrentUserId(7);
      const [row] = await sql`
        select current_setting('app.current_user_id', true) as v
      `;
      return row.v;
    });
    expect(seen).toBe('7');

    // After unit A's transaction ends, a query issued OUTSIDE any request context
    // (directly on the pool — possibly the very same physical connection) must
    // NOT see id 7. set_config(..., true) is transaction-local and reset at COMMIT.
    const [afterOnPool] = await sql`
      select current_setting('app.current_user_id', true) as v
    `;
    expect(afterOnPool.v).not.toBe('7'); // the security property: no bleed
    expect(isUnset(afterOnPool.v)).toBe(true);

    // And a SEPARATE wrapped unit that sets a different id sees only its own.
    const unitB = await withTransaction(async () => {
      await setCurrentUserId(8);
      const [row] = await sql`
        select current_setting('app.current_user_id', true) as v
      `;
      return row.v;
    });
    expect(unitB).toBe('8');
  });
});

describe('RLS R1 — proxy fidelity through the request-aware sql (real Postgres)', () => {
  it('forwards a tagged-template query', async () => {
    const rows = await sql`select 1 as n, 'ok' as s`;
    expect(rows[0]).toMatchObject({ n: 1, s: 'ok' });
  });

  it('forwards sql.json on a write and reads back a parsed jsonb object', async () => {
    // Seed the FK chain with the raw client, then write/read through the proxy.
    await seedOwnerWithPet(raw, {
      authUserId: 1,
      profileId: 1,
      username: 'owner',
      petId: 1,
      petName: 'Rex',
    });

    const schedule = { items: [{ id: 'w1', type: 'weight' }], reminderTiming: 'on_time' };
    await sql`
      insert into routines (pet_id, owner_user_id, routine_type, wellness_check_schedule)
      values (1, 1, 'wellness_check', ${sql.json(schedule)})
    `;

    const [row] = await sql`
      select wellness_check_schedule as s, jsonb_typeof(wellness_check_schedule) as t
      from routines
    `;
    expect(row.t).toBe('object');
    expect(row.s).toEqual(schedule);
  });

  it('forwards sql.unsafe with bound parameters', async () => {
    const rows = await sql.unsafe('select $1::int + $2::int as sum', [2, 3]);
    expect(rows[0].sum).toBe(5);
  });

  it('proxy fidelity holds INSIDE a request context too (delegates to the tx)', async () => {
    const out = await withTransaction(async () => {
      await setCurrentUserId(42);
      const tagged = await sql`select 9 as n`;
      const unsafe = await sql.unsafe('select $1::text as v', ['hi']);
      const [id] = await sql`select current_setting('app.current_user_id', true) as v`;
      return { tagged: tagged[0].n, unsafe: unsafe[0].v, id: id.v };
    });
    expect(out).toEqual({ tagged: 9, unsafe: 'hi', id: '42' });
  });
});

describe('RLS R1 — RLS-capability smoke (throwaway schema, de-risks R2)', () => {
  // Proves THIS Postgres enforces a current_setting-keyed policy under FORCE RLS,
  // acting as a NON-OWNER role — exactly the shape R2 will apply to real tables.
  // Everything here is throwaway (a temp table + a dedicated role), never a policy
  // on a real table.
  it('a non-owner role with FORCE RLS sees only rows matching app.current_user_id', async () => {
    const url = new URL(inject('TEST_DATABASE_URL'));
    const roleName = 'pawpi_rls_smoke';
    const rolePass = 'smoke_pw';

    // --- Setup as the privileged (owner) role ---
    await raw.unsafe(`
      drop table if exists rls_smoke;
      create table rls_smoke (owner_id int not null, val text not null);
      insert into rls_smoke (owner_id, val) values (1, 'A-secret'), (2, 'B-secret');
      alter table rls_smoke enable row level security;
      alter table rls_smoke force row level security;
      create policy owner_isolation on rls_smoke
        using (owner_id = nullif(current_setting('app.current_user_id', true), '')::int);
    `);
    await raw.unsafe(`drop role if exists ${roleName}`);
    await raw.unsafe(
      `create role ${roleName} login password '${rolePass}'`,
    );
    await raw.unsafe(`grant usage on schema public to ${roleName}`);
    await raw.unsafe(`grant select on rls_smoke to ${roleName}`);

    // --- Act AS the non-owner role ---
    const asRole = postgres({
      host: url.hostname,
      port: Number(url.port),
      database: url.pathname.replace(/^\//, ''),
      username: roleName,
      password: rolePass,
      max: 1,
      onnotice: () => {},
    });
    try {
      const rows = await asRole.begin(async (tx) => {
        // Pretend to be owner A (id 1).
        await tx`select set_config('app.current_user_id', '1', true)`;
        return tx`select owner_id, val from rls_smoke order by owner_id`;
      });

      // Owner A sees ONLY their row; owner B's row is filtered out entirely.
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ owner_id: 1, val: 'A-secret' });
      expect(rows.some((r: any) => r.owner_id === 2)).toBe(false);

      // With NO identity set, FORCE RLS yields zero rows (deny-by-default).
      const none = await asRole`select owner_id from rls_smoke`;
      expect(none).toHaveLength(0);
    } finally {
      await asRole.end();
      // Clean up the throwaway role/table (resetDb only truncates public tables).
      // drop owned by first: the GRANTs make the role un-droppable otherwise.
      await raw.unsafe(`drop table if exists rls_smoke`);
      await raw.unsafe(`drop owned by ${roleName}`);
      await raw.unsafe(`drop role if exists ${roleName}`);
    }
  });
});
