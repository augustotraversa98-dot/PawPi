// Ticket B2 — walk packages (offerings) + prepaid credit balance, proven through the REAL Hono
// router (api.request) BY URL on real Postgres as pawpi_app, PLUS raw as-pawpi_app RLS proofs and
// the grant-on-paid idempotency at the DB-helper level. Mirrors adoption-applications-v2 (auth mock
// + api.request) and walking-rls (asApp transactions).
//
// Proves:
//   • package CRUD gated: non-integer id → 404 BEFORE SQL; non-walker provider → 403 (capability);
//     non-staff → 403; owner|admin create/patch/soft-delete; list returns all, public returns active.
//   • purchase price is server-trusted (the route reads walk_packages, ignores a client price) — see
//     the mocked route.test for the createCheckout wiring; here we prove the ORDER shape via grant.
//   • grant-on-paid: app_grant_walk_credits mints exactly one credit pack per paid walk_package
//     order, idempotently (a second call = no double-grant); wrong kind / missing package → no grant.
//   • balance read: owner sees remaining across packs; another owner sees 0.
//   • RLS: walk_packages (public active/published read, admin write) + walk_credit_packs (owner-own
//     + provider-staff read, NO direct write) — both ENABLE+FORCE with policies.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedOwnerWithPet,
  seedUser,
  seedProvider,
  seedStaff,
  seedCapability,
} from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

// O = buying owner (has a pet). B = another owner. WOWN = walker owner/admin. WSTF = active walker
// staff. VQ = a different provider's admin. X = authed outsider.
const O = { authUserId: 1, profileId: 1, username: 'owner', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'otherowner', petId: 2, petName: 'Fido' };
const WOWN = { authUserId: 3, profileId: 3, username: 'walkown' };
const WSTF = { authUserId: 4, profileId: 4, username: 'walkstaff' };
const VQ = { authUserId: 5, profileId: 5, username: 'otherprov' };
const X = { authUserId: 6, profileId: 6, username: 'outsider' };

const WALKER = 10; // published walker provider
const DRAFT = 11; // a draft walker provider (not public)
const OTHER = 30; // a different published provider (cross-leak control)

let raw: Sql;
let app: Sql;
let api: any;

const sessionFor = (authUserId: number) => ({ user: { id: authUserId } });

function apiReq(path: string, method = 'GET', body?: unknown) {
  return api.request(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

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
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'disable';
  ({ api } = (await import('../../__create/route-builder')) as any);
});

afterAll(async () => {
  await app.end();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});

beforeEach(async () => {
  await seedOwnerWithPet(raw, O);
  await seedOwnerWithPet(raw, B);
  await seedUser(raw, WOWN);
  await seedUser(raw, WSTF);
  await seedUser(raw, VQ);
  await seedUser(raw, X);

  await seedProvider(raw, { providerId: WALKER, ownerUserProfileId: WOWN.profileId, slug: 'paw-walks', status: 'published' });
  await seedStaff(raw, { providerId: WALKER, userProfileId: WOWN.profileId, role: 'owner', status: 'active' });
  await seedStaff(raw, { providerId: WALKER, userProfileId: WSTF.profileId, role: 'staff', status: 'active' });
  await seedCapability(raw, { providerId: WALKER, capability: 'walker' });

  await seedProvider(raw, { providerId: DRAFT, ownerUserProfileId: WOWN.profileId, slug: 'draft-walks', status: 'draft' });
  await seedStaff(raw, { providerId: DRAFT, userProfileId: WOWN.profileId, role: 'owner', status: 'active' });
  await seedCapability(raw, { providerId: DRAFT, capability: 'walker' });

  await seedProvider(raw, { providerId: OTHER, ownerUserProfileId: VQ.profileId, slug: 'otherprov', status: 'published' });
  await seedStaff(raw, { providerId: OTHER, userProfileId: VQ.profileId, role: 'owner', status: 'active' });
  await seedCapability(raw, { providerId: OTHER, capability: 'walker' });
});

// Seed a walk_packages offering via raw (superuser bypasses RLS). Returns the id.
async function seedPackage(opts: {
  providerId: number;
  walksCount: number;
  priceCents: number;
  active?: boolean;
}): Promise<number> {
  const { providerId, walksCount, priceCents, active = true } = opts;
  const [row] = await raw<{ id: number }[]>`
    insert into walk_packages (provider_id, walks_count, price_cents, active)
    values (${providerId}, ${walksCount}, ${priceCents}, ${active})
    returning id
  `;
  return row.id;
}

// Seed a walk_package order (source_ref = 'walk_package:<packageId>') via raw. Returns the id.
async function seedWalkPackageOrder(opts: {
  ownerUserId: number;
  providerId: number;
  packageId: number | null;
  amountCents?: number;
  kind?: string;
}): Promise<number> {
  const { ownerUserId, providerId, packageId, amountCents = 10000, kind = 'walk_package' } = opts;
  const sourceRef = packageId != null ? `walk_package:${packageId}` : null;
  const [row] = await raw<{ id: number }[]>`
    insert into orders (owner_user_id, provider_id, kind, source_ref, amount_cents, currency, status)
    values (${ownerUserId}, ${providerId}, ${kind}, ${sourceRef}, ${amountCents}, 'ARS', 'pending')
    returning id
  `;
  return row.id;
}

// ── package CRUD through the REAL router ──────────────────────────────────────
describe('B2 — walk-packages CRUD (real router)', () => {
  const url = `/providers/${WALKER}/walk-packages`;

  it('404 (before SQL) for a non-integer provider id', async () => {
    authState.session = sessionFor(WOWN.authUserId);
    const res = await apiReq('/providers/reorder/walk-packages', 'GET');
    expect(res.status).toBe(404);
  });

  it('403 for a non-walker provider (capability gate)', async () => {
    // Strip WALKER's walker capability by pointing at a provider that lacks it.
    await raw`insert into provider_capabilities (provider_id, capability) values (${OTHER}, 'shop')`;
    await raw`delete from provider_capabilities where provider_id = ${OTHER} and capability = 'walker'`;
    authState.session = sessionFor(VQ.authUserId);
    const res = await apiReq(`/providers/${OTHER}/walk-packages`, 'GET');
    expect(res.status).toBe(403);
  });

  it('403 for a non-staff caller', async () => {
    authState.session = sessionFor(X.authUserId);
    const res = await apiReq(url, 'GET');
    expect(res.status).toBe(403);
  });

  it('owner creates a package; list returns it; validates fields', async () => {
    authState.session = sessionFor(WOWN.authUserId);
    const bad = await apiReq(url, 'POST', { walks_count: 0, price_cents: 100 });
    expect(bad.status).toBe(400);

    const res = await apiReq(url, 'POST', { walks_count: 10, price_cents: 90000 });
    expect(res.status).toBe(201);
    const { package: pkg } = await res.json();
    expect(pkg).toMatchObject({ walks_count: 10, price_cents: 90000, active: true, currency: 'ARS' });

    const list = await apiReq(url, 'GET');
    expect((await list.json()).packages).toHaveLength(1);
  });

  it('PATCH updates price; DELETE soft-deletes (active=false); cross-provider 404', async () => {
    const pkgId = await seedPackage({ providerId: WALKER, walksCount: 20, priceCents: 150000 });
    authState.session = sessionFor(WOWN.authUserId);

    const patch = await apiReq(`${url}/${pkgId}`, 'PATCH', { price_cents: 120000 });
    expect(patch.status).toBe(200);
    expect((await patch.json()).package.price_cents).toBe(120000);

    // A package that belongs to another provider → 404 (scoped by id AND provider_id). WOWN owns
    // DRAFT too, so the gate passes but the WALKER package matches no DRAFT-scoped row → 404.
    const cross = await apiReq(`/providers/${DRAFT}/walk-packages/${pkgId}`, 'PATCH', { price_cents: 1 });
    expect(cross.status).toBe(404);

    const del = await apiReq(`${url}/${pkgId}`, 'DELETE');
    expect(del.status).toBe(200);
    expect((await del.json()).package.active).toBe(false);

    // A non-integer packageId → 404 before SQL.
    const nonInt = await apiReq(`${url}/reorder`, 'PATCH', { price_cents: 1 });
    expect(nonInt.status).toBe(404);
  });

  it('public profile returns ACTIVE packages only', async () => {
    await seedPackage({ providerId: WALKER, walksCount: 1, priceCents: 10000, active: true });
    await seedPackage({ providerId: WALKER, walksCount: 10, priceCents: 90000, active: false });
    authState.session = sessionFor(O.authUserId);
    const res = await apiReq('/providers/public/paw-walks', 'GET');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.walk_packages).toHaveLength(1);
    expect(body.walk_packages[0]).toMatchObject({ walks_count: 1, price_cents: 10000 });
  });
});

// ── grant-on-paid idempotency (DB helper) ─────────────────────────────────────
describe('B2 — app_grant_walk_credits grants exactly once', () => {
  it('grants a credit pack with the package walks_count; a second call is a no-op', async () => {
    const pkgId = await seedPackage({ providerId: WALKER, walksCount: 10, priceCents: 90000 });
    const orderId = await seedWalkPackageOrder({ ownerUserId: O.profileId, providerId: WALKER, packageId: pkgId });

    const [g1] = await raw<{ id: number | null }[]>`select app_grant_walk_credits(${orderId}) as id`;
    expect(g1.id).not.toBeNull();
    const [g2] = await raw<{ id: number | null }[]>`select app_grant_walk_credits(${orderId}) as id`;
    expect(g2.id).toBeNull(); // already granted → no double-grant

    const packs = await raw<{ walks_total: number; walks_used: number }[]>`
      select walks_total, walks_used from walk_credit_packs where order_id = ${orderId}
    `;
    expect(packs).toHaveLength(1);
    expect(packs[0]).toMatchObject({ walks_total: 10, walks_used: 0 });
  });

  it('does not grant for a non-walk_package order', async () => {
    const orderId = await seedWalkPackageOrder({
      ownerUserId: O.profileId, providerId: WALKER, packageId: null, kind: 'booking',
    });
    const [g] = await raw<{ id: number | null }[]>`select app_grant_walk_credits(${orderId}) as id`;
    expect(g.id).toBeNull();
    expect(await raw`select id from walk_credit_packs`).toHaveLength(0);
  });

  it('does not grant when the referenced package is gone', async () => {
    const orderId = await seedWalkPackageOrder({ ownerUserId: O.profileId, providerId: WALKER, packageId: 99999 });
    const [g] = await raw<{ id: number | null }[]>`select app_grant_walk_credits(${orderId}) as id`;
    expect(g.id).toBeNull();
  });
});

// ── balance read through the router ───────────────────────────────────────────
describe('B2 — owner balance read', () => {
  it('sums remaining across active packs; another owner sees 0', async () => {
    const pkgId = await seedPackage({ providerId: WALKER, walksCount: 10, priceCents: 90000 });
    const orderId = await seedWalkPackageOrder({ ownerUserId: O.profileId, providerId: WALKER, packageId: pkgId });
    await raw`select app_grant_walk_credits(${orderId})`;
    // Spend one to prove remaining = total - used.
    await raw`update walk_credit_packs set walks_used = 1 where order_id = ${orderId}`;

    authState.session = sessionFor(O.authUserId);
    const mine = await apiReq(`/providers/${WALKER}/walk-credits`, 'GET');
    expect(mine.status).toBe(200);
    expect((await mine.json()).remaining).toBe(9);

    authState.session = sessionFor(B.authUserId);
    const other = await apiReq(`/providers/${WALKER}/walk-credits`, 'GET');
    expect((await other.json()).remaining).toBe(0);
  });
});

// ── RLS proofs (as pawpi_app) ─────────────────────────────────────────────────
describe('B2 — walk_packages RLS', () => {
  it('any authed user reads an ACTIVE package of a PUBLISHED provider; not an inactive/draft one', async () => {
    const activeId = await seedPackage({ providerId: WALKER, walksCount: 1, priceCents: 10000, active: true });
    await seedPackage({ providerId: WALKER, walksCount: 10, priceCents: 90000, active: false });
    await seedPackage({ providerId: DRAFT, walksCount: 1, priceCents: 10000, active: true });
    await asApp(X.profileId, async (tx) => {
      const rows = await tx`select id from walk_packages`;
      expect(rows.map((r: any) => r.id)).toEqual([activeId]);
    });
  });

  it('active staff read ALL of their provider packages (incl. inactive)', async () => {
    const inactiveId = await seedPackage({ providerId: WALKER, walksCount: 10, priceCents: 90000, active: false });
    await asApp(WSTF.profileId, async (tx) => {
      const rows = await tx`select id from walk_packages where provider_id = ${WALKER}`;
      expect(rows.map((r: any) => r.id)).toContain(inactiveId);
    });
  });

  it('staff (non-admin) cannot write; admin can', async () => {
    // A failed write aborts the whole tx, so wrap the reject at the asApp level.
    await expect(
      asApp(WSTF.profileId, (tx) => tx`
        insert into walk_packages (provider_id, walks_count, price_cents) values (${WALKER}, 5, 5000)
      `),
    ).rejects.toThrow(/row-level security/i);
    await asApp(WOWN.profileId, async (tx) => {
      const created = await tx`insert into walk_packages (provider_id, walks_count, price_cents) values (${WALKER}, 5, 5000) returning id`;
      expect(created).toHaveLength(1);
    });
  });
});

describe('B2 — walk_credit_packs RLS', () => {
  it('owner reads own; another owner reads 0; provider staff read their provider balances', async () => {
    const pkgId = await seedPackage({ providerId: WALKER, walksCount: 10, priceCents: 90000 });
    const orderId = await seedWalkPackageOrder({ ownerUserId: O.profileId, providerId: WALKER, packageId: pkgId });
    await raw`select app_grant_walk_credits(${orderId})`;

    await asApp(O.profileId, async (tx) => {
      expect(await tx`select id from walk_credit_packs`).toHaveLength(1);
    });
    await asApp(B.profileId, async (tx) => {
      expect(await tx`select id from walk_credit_packs`).toHaveLength(0);
    });
    await asApp(WSTF.profileId, async (tx) => {
      expect(await tx`select id from walk_credit_packs where provider_id = ${WALKER}`).toHaveLength(1);
    });
    // Another provider's staff cannot see it.
    await asApp(VQ.profileId, async (tx) => {
      expect(await tx`select id from walk_credit_packs`).toHaveLength(0);
    });
  });

  it('an owner CANNOT self-mint a credit pack (no direct INSERT policy)', async () => {
    await expect(
      asApp(O.profileId, (tx) => tx`
        insert into walk_credit_packs (owner_user_id, provider_id, walks_total)
        values (${O.profileId}, ${WALKER}, 10)
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('an owner CANNOT self-decrement (no direct UPDATE policy)', async () => {
    const pkgId = await seedPackage({ providerId: WALKER, walksCount: 10, priceCents: 90000 });
    const orderId = await seedWalkPackageOrder({ ownerUserId: O.profileId, providerId: WALKER, packageId: pkgId });
    await raw`select app_grant_walk_credits(${orderId})`;
    await asApp(O.profileId, async (tx) => {
      expect(await tx`update walk_credit_packs set walks_used = 5 returning id`).toHaveLength(0);
    });
  });
});

describe('B2 — completeness: both tables are ENABLE+FORCE RLS with policies', () => {
  it('walk_packages + walk_credit_packs are policied', async () => {
    const rows = await raw<
      { table: string; enabled: boolean; forced: boolean; policies: number }[]
    >`
      select c.relname as table,
             c.relrowsecurity as enabled,
             c.relforcerowsecurity as forced,
             (select count(*) from pg_policies p
               where p.schemaname = 'public' and p.tablename = c.relname)::int as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname in ('walk_packages', 'walk_credit_packs')
      order by c.relname
    `;
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.enabled, `${r.table} ENABLE`).toBe(true);
      expect(r.forced, `${r.table} FORCE`).toBe(true);
      expect(r.policies, `${r.table} ≥1 policy`).toBeGreaterThan(0);
    }
  });
});
