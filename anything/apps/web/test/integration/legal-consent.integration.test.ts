// Legal consent (migration 0067) — proven on the REAL table acting AS pawpi_app.
// Companion to ugc-moderation / the RLS suites. Covers the signup consent ledger:
//   legal_consents — append-only, keyed to auth_users.id (NOT user_profiles.id, which may not
//                    exist yet at signup). FORCE RLS with NO owner write path: the ONLY writer
//                    is the SECURITY DEFINER helper app_record_consent, which succeeds with no
//                    app.current_user_id set. Reads are admin-only (the 0065 app_is_admin check).
//
// Pattern mirrors the sibling suites: a raw superuser client seeds; a second porsager client
// AS pawpi_app (NOBYPASSRLS) runs every assertion inside a per-tx identity stamp.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };   // signs up
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };  // non-admin
const C = { authUserId: 3, profileId: 3, username: 'ownerc', petId: 3, petName: 'Coco' };   // admin

const TERMS = '2026-06-22';
const PRIVACY = '2026-06-22';

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
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  await seedOwnerWithPet(raw, C);
  await raw`update user_profiles set role = 'admin' where id = ${C.profileId}`;
});

// ──────────────────────────────────────────────────────────────────────────────
describe('legal consent — app_record_consent (DEFINER) writes under FORCE RLS', () => {
  it('records exactly one row with NO app.current_user_id set (the signup case)', async () => {
    const out = await asApp(null, (tx) =>
      tx`select app_record_consent(${A.authUserId}, ${TERMS}, ${PRIVACY}, 'web_signup', 'jest-ua')`,
    );
    expect(out).toHaveLength(1);

    const rows = await raw`select * from legal_consents where auth_user_id = ${A.authUserId}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].terms_version).toBe(TERMS);
    expect(rows[0].privacy_version).toBe(PRIVACY);
    expect(rows[0].source).toBe('web_signup');
    expect(rows[0].user_agent).toBe('jest-ua');
    expect(rows[0].accepted_at).not.toBeNull();
  });

  it('is append-only: a second call adds a SECOND row (never overwrites)', async () => {
    await asApp(null, (tx) => tx`select app_record_consent(${A.authUserId}, ${TERMS}, ${PRIVACY}, 'web_signup', null)`);
    await asApp(null, (tx) => tx`select app_record_consent(${A.authUserId}, ${TERMS}, ${PRIVACY}, 'mobile_signup', null)`);
    const [{ n }] = await raw`select count(*)::int as n from legal_consents where auth_user_id = ${A.authUserId}`;
    expect(n).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('legal consent — direct pawpi_app access is denied by RLS', () => {
  it('a direct INSERT is rejected (no owner insert policy under FORCE RLS) — no identity', async () => {
    await expect(
      asApp(null, (tx) => tx`
        insert into legal_consents (auth_user_id, terms_version, privacy_version)
        values (${A.authUserId}, ${TERMS}, ${PRIVACY})
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('a direct INSERT is rejected even WITH an identity in scope (still no insert policy)', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`
        insert into legal_consents (auth_user_id, terms_version, privacy_version)
        values (${B.authUserId}, ${TERMS}, ${PRIVACY})
      `),
    ).rejects.toThrow(/row-level security/i);
    const [{ n }] = await raw`select count(*)::int as n from legal_consents`;
    expect(n).toBe(0);
  });

  it('a NON-admin SELECT sees ZERO rows even though rows exist (admin-only read)', async () => {
    await asApp(null, (tx) => tx`select app_record_consent(${A.authUserId}, ${TERMS}, ${PRIVACY}, 'web_signup', null)`);
    // sanity: the row really is there (superuser bypasses RLS)
    const [{ n }] = await raw`select count(*)::int as n from legal_consents`;
    expect(n).toBe(1);

    await asApp(B.profileId, async (tx) => {
      expect(await tx`select id from legal_consents`).toHaveLength(0);
    });
    await asApp(null, async (tx) => {
      expect(await tx`select id from legal_consents`).toHaveLength(0);
    });
  });

  it('an ADMIN SELECT can read the ledger', async () => {
    await asApp(null, (tx) => tx`select app_record_consent(${A.authUserId}, ${TERMS}, ${PRIVACY}, 'web_signup', null)`);
    await asApp(C.profileId, async (tx) => {
      expect(await tx`select id from legal_consents`).toHaveLength(1);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('legal consent — completeness: legal_consents is FORCE-RLS with a policy', () => {
  it('is ENABLE+FORCE RLS with exactly the admin SELECT policy', async () => {
    const rows = await raw<{ enabled: boolean; forced: boolean; policies: number }[]>`
      select c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
             (select count(*) from pg_policies p where p.schemaname='public' and p.tablename='legal_consents')::int as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public' and c.relname='legal_consents'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled).toBe(true);
    expect(rows[0].forced).toBe(true);
    expect(rows[0].policies).toBe(1);
  });
});
