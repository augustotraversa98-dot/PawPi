// Ticket 2.1 — provider_capabilities RLS, proven on the REAL table acting AS pawpi_app.
// Companion to provider-business-rls (R2e), whose policy shape this mirrors: a
// capability of a PUBLISHED provider is PUBLIC (any authed user — for discovery), a
// draft provider's caps are visible to active staff only, and writes are owner|admin
// (app_is_provider_admin). The proofs mirror the routes EXACTLY — no wider:
//   SELECT — public read of a published provider's caps (discovery) OR active-staff read
//            of all caps (incl. a draft provider).
//   write  — owner|admin add/remove (the onboarding multi-select + the add/remove
//            endpoint); plain staff and outsiders are denied.
// Plus: the BACKFILL (one cap per existing provider from provider_type) and the
// providerHasCapability() / provider_has_capability() DEFINER helper under FORCE RLS.
//
// As in the sibling suites we connect a SECOND porsager client AS pawpi_app
// (NOBYPASSRLS), set app.current_user_id per transaction, and assert allowed-vs-ZERO.
// The harness owner is a superuser, so FORCE RLS constrains only pawpi_app.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedUser,
  seedProvider,
  seedStaff,
  seedCapability,
} from './db';

const OWNER = { authUserId: 10, profileId: 10, username: 'biz_owner' };
const ADMIN = { authUserId: 11, profileId: 11, username: 'biz_admin' };
const STAFF = { authUserId: 12, profileId: 12, username: 'biz_staff' };
const OUTSIDER = { authUserId: 13, profileId: 13, username: 'outsider' };
const OWNER2 = { authUserId: 30, profileId: 30, username: 'biz_owner2' };
const STAFF2 = { authUserId: 31, profileId: 31, username: 'biz_staff2' };

const P1 = 1; // draft by default; published per-test as needed
const P2 = 2;

let raw: Sql;
let app: Sql;

/** Run `fn` as pawpi_app inside one transaction stamped with `userId` (or no id). */
function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}

const caps = (rows: any[]) => rows.map((r: any) => r.capability).sort();

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

// Provider 1 (draft) owner+admin+staff active; provider 2 (draft) its own owner+staff.
// P1 holds vet + shop (a "vet shop"); P2 holds groomer.
beforeEach(async () => {
  for (const u of [OWNER, ADMIN, STAFF, OUTSIDER, OWNER2, STAFF2]) {
    await seedUser(raw, u);
  }
  await seedProvider(raw, { providerId: P1, ownerUserProfileId: OWNER.profileId, slug: 'clinic-1' });
  await seedStaff(raw, { providerId: P1, userProfileId: OWNER.profileId, role: 'owner', status: 'active' });
  await seedStaff(raw, { providerId: P1, userProfileId: ADMIN.profileId, role: 'admin', status: 'active' });
  await seedStaff(raw, { providerId: P1, userProfileId: STAFF.profileId, role: 'staff', status: 'active' });
  await seedProvider(raw, { providerId: P2, ownerUserProfileId: OWNER2.profileId, slug: 'clinic-2' });
  await seedStaff(raw, { providerId: P2, userProfileId: OWNER2.profileId, role: 'owner', status: 'active' });
  await seedStaff(raw, { providerId: P2, userProfileId: STAFF2.profileId, role: 'staff', status: 'active' });
  await seedCapability(raw, { providerId: P1, capability: 'vet' });
  await seedCapability(raw, { providerId: P1, capability: 'shop' });
  await seedCapability(raw, { providerId: P2, capability: 'groomer' });
  await raw`select setval(pg_get_serial_sequence('provider_capabilities','id'), (select max(id) from provider_capabilities))`;
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. SELECT — public read (published) vs staff read (incl. draft) vs deny-by-default.
describe('provider_capabilities SELECT (as pawpi_app)', () => {
  it('staff read ALL of their provider\'s caps while DRAFT; an outsider sees ZERO', async () => {
    await asApp(STAFF.profileId, async (tx) => {
      expect(caps(await tx`select capability from provider_capabilities where provider_id = ${P1}`))
        .toEqual(['shop', 'vet']);
    });
    await asApp(OUTSIDER.profileId, async (tx) => {
      expect(await tx`select id from provider_capabilities`).toHaveLength(0);
    });
  });

  it('public read (discovery): a PUBLISHED provider\'s caps are visible to any authed user', async () => {
    await raw`update providers set status = 'published' where id = ${P1}`;
    await asApp(OUTSIDER.profileId, async (tx) => {
      // P1 published → its caps visible; P2 still draft → hidden.
      expect(caps(await tx`select capability from provider_capabilities`)).toEqual(['shop', 'vet']);
    });
  });

  it('no identity → zero rows (both draft, deny-by-default)', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from provider_capabilities`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. WRITE — owner|admin add/remove; plain staff + outsiders denied.
describe('provider_capabilities WRITE (as pawpi_app)', () => {
  it('owner|admin add a capability (INSERT) and remove one (DELETE)', async () => {
    await asApp(ADMIN.profileId, async (tx) => {
      const added = await tx`
        insert into provider_capabilities (provider_id, capability)
        values (${P1}, 'pharmacy') returning id, capability
      `;
      expect(added).toHaveLength(1);
      expect(added[0].capability).toBe('pharmacy');
      expect(
        await tx`delete from provider_capabilities where provider_id = ${P1} and capability = 'shop' returning id`,
      ).toHaveLength(1);
    });
  });

  it('plain staff INSERT is rejected by WITH CHECK; DELETE matches ZERO rows', async () => {
    await expect(
      asApp(STAFF.profileId, (tx) => tx`
        insert into provider_capabilities (provider_id, capability) values (${P1}, 'walker')
      `),
    ).rejects.toThrow(/row-level security/i);
    await asApp(STAFF.profileId, async (tx) => {
      expect(
        await tx`delete from provider_capabilities where provider_id = ${P1} and capability = 'vet' returning id`,
      ).toHaveLength(0);
    });
    const [{ n }] = await raw`select count(*)::int as n from provider_capabilities where provider_id = ${P1}`;
    expect(n).toBe(2); // untouched
  });

  it('cross-provider isolation: P1 admin cannot write a capability onto P2', async () => {
    await expect(
      asApp(ADMIN.profileId, (tx) => tx`
        insert into provider_capabilities (provider_id, capability) values (${P2}, 'walker')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('no identity → INSERT reject, DELETE zero', async () => {
    await expect(
      asApp(null, (tx) => tx`
        insert into provider_capabilities (provider_id, capability) values (${P1}, 'walker')
      `),
    ).rejects.toThrow(/row-level security/i);
    await asApp(null, async (tx) => {
      expect(await tx`delete from provider_capabilities returning id`).toHaveLength(0);
    });
  });

  it('the CHECK constraint rejects a capability outside the allowed set (defense in depth)', async () => {
    await expect(
      asApp(ADMIN.profileId, (tx) => tx`
        insert into provider_capabilities (provider_id, capability) values (${P1}, 'wizardry')
      `),
    ).rejects.toThrow(/provider_capabilities_capability_check|check constraint/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. provider_has_capability() DEFINER helper — resolves correctly under FORCE RLS.
describe('provider_has_capability helper (as pawpi_app, under FORCE RLS)', () => {
  it('returns true for a held capability, false otherwise — regardless of caller scope', async () => {
    // Even a plain staff caller (who can SELECT) and an outsider get a correct boolean,
    // because the helper is SECURITY DEFINER and bypasses provider_capabilities RLS.
    await asApp(STAFF.profileId, async (tx) => {
      expect((await tx`select provider_has_capability(${P1}, 'vet') as v`)[0].v).toBe(true);
      expect((await tx`select provider_has_capability(${P1}, 'walker') as v`)[0].v).toBe(false);
    });
    await asApp(OUTSIDER.profileId, async (tx) => {
      expect((await tx`select provider_has_capability(${P1}, 'shop') as v`)[0].v).toBe(true);
      expect((await tx`select provider_has_capability(${P2}, 'vet') as v`)[0].v).toBe(false);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. BACKFILL — one capability row per existing provider, derived from provider_type.
//    Reset the table, insert providers with assorted provider_types, re-run the
//    backfill statement, and assert exactly one matching cap per known provider_type.
describe('provider_capabilities backfill (provider_type → capability)', () => {
  it('inserts one cap per provider whose provider_type is a known capability; skips unknown', async () => {
    await raw`delete from provider_capabilities`;
    await raw`delete from providers`;
    await raw`
      insert into providers (id, owner_user_profile_id, provider_type, name, slug, status) values
        (50, ${OWNER.profileId}, 'vet', 'V', 'v', 'draft'),
        (51, ${OWNER.profileId}, 'groomer', 'G', 'g', 'draft'),
        (52, ${OWNER.profileId}, 'legacy_freeform', 'L', 'l', 'draft')
    `;
    // The exact backfill statement from 0027.
    await raw`
      insert into provider_capabilities (provider_id, capability)
      select p.id, p.provider_type
      from providers p
      where p.provider_type = any (array[
        'vet','groomer','walker','daycare','sitter','trainer',
        'shop','adoption','transport','pharmacy'
      ]::text[])
      on conflict (provider_id, capability) do nothing
    `;
    const rows = await raw`select provider_id, capability from provider_capabilities order by provider_id`;
    expect(rows.map((r: any) => [r.provider_id, r.capability])).toEqual([
      [50, 'vet'],
      [51, 'groomer'],
      // 52 (legacy_freeform) skipped — not a known capability.
    ]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. Catalog — the table is ENABLE + FORCE RLS and carries its expected policies.
describe('provider_capabilities catalog: FORCE-RLS + policied', () => {
  it('rowsecurity + forcerowsecurity = true and the expected policies exist', async () => {
    const [flags] = await raw`
      select relrowsecurity, relforcerowsecurity
      from pg_class where oid = 'public.provider_capabilities'::regclass
    `;
    expect(flags.relrowsecurity).toBe(true);
    expect(flags.relforcerowsecurity).toBe(true);

    const policies = await raw`
      select policyname from pg_policies
      where schemaname = 'public' and tablename = 'provider_capabilities'
    `;
    const names = policies.map((p: any) => p.policyname);
    for (const p of ['provider_capabilities_read', 'provider_capabilities_admin_all']) {
      expect(names).toContain(p);
    }
  });
});
