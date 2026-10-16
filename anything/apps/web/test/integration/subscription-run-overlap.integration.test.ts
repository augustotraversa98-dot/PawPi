// Overlap safety for the daily shop auto-reorder charger (POST /api/payments/subscriptions/run).
//
// Finding (docs/ops/railway-cron.md): app_due_subscriptions() is a plain read with no row locking, so
// two SIMULTANEOUS runs (e.g. the manual GitHub fallback fired during the 06:00 Railway run) both read
// the same due set and each inserted its own `orders` row. The payment deduped on its idempotency key, so
// nobody was double-charged, but an orphan `pending` order was left behind.
//
// Fix: each per-subscription transaction takes pg_try_advisory_xact_lock(hashtext('sub-charge'), sub.id)
// (skip when it returns false) and re-reads next_charge_at under the lock (skip when no longer due).
//
// This suite drives the REAL route handler against the embedded Postgres AS pawpi_app (NOBYPASSRLS,
// FORCE RLS) — so it also proves pawpi_app may call the advisory-lock functions. Only the payment
// provider call (createCheckout) is replaced by a counter, so "ONE charge attempt" is observable.
//
// Proves:
//   1. a normal single run behaves as before: one order + one item, one charge attempt, schedule advanced;
//   2. two CONCURRENT runs over the same due sub produce exactly ONE order and ONE charge attempt;
//   3. a run holding a STALE due-set snapshot (it scanned before the first run committed) skips after the
//      lock because the sub is no longer due — still exactly one order / one charge;
//   4. a later sequential run does nothing (next_charge_at already advanced);
//   5. the lock is per subscription: concurrent runs over DIFFERENT due subs still charge each of them.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedUser, seedProvider, seedStaff, seedShopProduct, seedPaymentAccount } from './db';

const h = vi.hoisted(() => ({
  // Resolves each createCheckout call; tests swap it to hold the first run's lock open.
  checkoutGate: null as null | Promise<void>,
  onCheckoutEntered: null as null | (() => void),
  // When set, setCurrentUserId (called right after a run's due-scan + BEGIN, right before its lock
  // attempt) waits on it — used to force a run to hold a stale due-set snapshot.
  identityGate: null as null | Promise<void>,
  checkoutCalls: [] as Array<{ orderId: number; idempotencyKey: string }>,
}));

vi.mock('@/app/api/utils/payments', () => ({
  createCheckout: vi.fn(async (order: any, opts: any) => {
    h.checkoutCalls.push({ orderId: order.id, idempotencyKey: opts.idempotencyKey });
    h.onCheckoutEntered?.();
    // Hold the transaction (and thus the advisory lock) open so an overlapping run can collide.
    await (h.checkoutGate ?? new Promise<void>((r) => setTimeout(r, 300)));
    return { payment: { id: 1 }, checkoutUrl: 'https://example.test/pay' };
  }),
}));

vi.mock('@/app/api/utils/requestContext', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    setCurrentUserId: async (userId: unknown) => {
      await actual.setCurrentUserId(userId);
      if (h.identityGate) await h.identityGate;
    },
  };
});

const A = { authUserId: 1, profileId: 1, username: 'ownera' };
const OWN = { authUserId: 3, profileId: 3, username: 'provowner' };
const P = 10;
const PROD = 50;
const SUB = 300;
const SUB2 = 301;

let raw: Sql;
let appSql: any;
let POST: (request: Request) => Promise<Response>;

const req = () =>
  new Request('http://localhost/api/payments/subscriptions/run', {
    method: 'POST',
    headers: { 'x-cron-secret': 'topsecret' },
  });

const run = async () => {
  const res = await POST(req());
  expect(res.status).toBe(200);
  return (await res.json()) as {
    processed: number;
    charged: number;
    skipped: Array<{ subId: number; reason: string }>;
    failed: unknown[];
  };
};

const count = async (table: string, where = '') =>
  Number((await raw.unsafe(`select count(*)::int as n from ${table} ${where}`))[0].n);

const nextChargeAt = async (id: number) =>
  (await raw<{ next_charge_at: Date }[]>`select next_charge_at from subscriptions where id = ${id}`)[0].next_charge_at;

async function seedDueSub(id: number) {
  await raw`
    insert into subscriptions (id, owner_user_id, provider_id, plan, status, product_id, quantity, next_charge_at)
    values (${id}, ${A.profileId}, ${P}, 'monthly', 'active', ${PROD}, 2, now() - interval '1 day')
  `;
}

beforeAll(async () => {
  raw = makeTestSql();

  const dbUrl = new URL(inject('TEST_DATABASE_URL'));
  dbUrl.username = 'pawpi_app';
  dbUrl.password = 'pawpi_app';
  process.env.DATABASE_URL = dbUrl.toString();
  process.env.DATABASE_SSL = 'disable';
  process.env.CRON_SECRET = 'topsecret';

  appSql = (await import('@/app/api/utils/sql')).default;
  POST = (await import('@/app/api/payments/subscriptions/run/route')).POST as any;
});

afterAll(async () => {
  await appSql.end?.();
  await raw.end();
});

beforeEach(async () => {
  await resetDb(raw);
  h.checkoutGate = null;
  h.onCheckoutEntered = null;
  h.identityGate = null;
  h.checkoutCalls.length = 0;

  await seedUser(raw, A);
  await seedUser(raw, OWN);
  await seedProvider(raw, { providerId: P, ownerUserProfileId: OWN.profileId, slug: 'prov-p', status: 'published' });
  await seedStaff(raw, { providerId: P, userProfileId: OWN.profileId, role: 'owner', status: 'active' });
  await seedShopProduct(raw, { productId: PROD, providerId: P, priceCents: 3000, stockQty: 10 });
  await seedPaymentAccount(raw, { accountId: 1, providerId: P, rail: 'mercadopago', accessToken: 'TOPSECRET' });
});

afterEach(async () => {
  await resetDb(raw);
});

describe('POST /api/payments/subscriptions/run — overlap safety', () => {
  it('a normal single run still charges once and advances the schedule', async () => {
    await seedDueSub(SUB);
    const before = await nextChargeAt(SUB);

    const body = await run();

    expect(body).toMatchObject({ processed: 1, charged: 1, skipped: [], failed: [] });
    expect(await count('orders')).toBe(1);
    expect(await count('order_items')).toBe(1);
    expect(h.checkoutCalls).toHaveLength(1);
    expect(h.checkoutCalls[0].idempotencyKey).toMatch(new RegExp(`^sub-${SUB}-\\d{4}-\\d{2}-\\d{2}$`));
    const [order] = await raw<{ amount_cents: number; source_ref: string; owner_user_id: number }[]>`
      select amount_cents, source_ref, owner_user_id from orders
    `;
    expect(order).toMatchObject({ amount_cents: 6000, source_ref: `subscription:${SUB}`, owner_user_id: A.profileId });
    expect((await nextChargeAt(SUB)).getTime()).toBeGreaterThan(before.getTime());
  });

  it('two CONCURRENT runs over the same due sub create exactly ONE order and ONE charge attempt', async () => {
    await seedDueSub(SUB);

    const [r1, r2] = await Promise.all([run(), run()]);

    expect(await count('orders')).toBe(1);
    expect(await count('order_items')).toBe(1);
    expect(h.checkoutCalls).toHaveLength(1);
    // Exactly one run charged; the other skipped without waiting, and nothing failed.
    expect(r1.charged + r2.charged).toBe(1);
    expect(r1.failed).toEqual([]);
    expect(r2.failed).toEqual([]);
    const skipped = [...r1.skipped, ...r2.skipped];
    expect(skipped).toEqual([{ subId: SUB, reason: 'already being charged' }]);
  });

  it('a run with a STALE due-set snapshot skips once the first run has committed (re-check under the lock)', async () => {
    await seedDueSub(SUB);

    // Run 1 holds its transaction open inside createCheckout until we release it.
    let releaseCheckout!: () => void;
    h.checkoutGate = new Promise<void>((r) => (releaseCheckout = r));
    const entered = new Promise<void>((r) => (h.onCheckoutEntered = r));
    const run1 = run();
    await entered;

    // Run 2 scans the due set NOW (run 1 has not committed → sub still looks due) but is parked
    // before its lock attempt until run 1 is done.
    let releaseIdentity!: () => void;
    h.identityGate = new Promise<void>((r) => (releaseIdentity = r));
    const run2 = run();
    await new Promise((r) => setTimeout(r, 150)); // let run 2 finish its scan + BEGIN and park

    releaseCheckout();
    const r1 = await run1; // run 1 commits: order inserted, next_charge_at advanced
    h.identityGate = null;
    releaseIdentity();
    const r2 = await run2; // run 2 now gets the lock, re-reads, sees it is no longer due

    expect(r1.charged).toBe(1);
    expect(r2.processed).toBe(1); // it really did hold the stale snapshot
    expect(r2.charged).toBe(0);
    expect(r2.skipped).toEqual([{ subId: SUB, reason: 'no longer due' }]);
    expect(await count('orders')).toBe(1);
    expect(h.checkoutCalls).toHaveLength(1);
  });

  it('a later sequential run does nothing (schedule already advanced)', async () => {
    await seedDueSub(SUB);
    expect((await run()).charged).toBe(1);

    const second = await run();

    expect(second).toMatchObject({ processed: 0, charged: 0, skipped: [], failed: [] });
    expect(await count('orders')).toBe(1);
    expect(h.checkoutCalls).toHaveLength(1);
  });

  it('the lock is per subscription: concurrent runs over two due subs still charge BOTH, once each', async () => {
    await seedDueSub(SUB);
    await seedDueSub(SUB2);

    const [r1, r2] = await Promise.all([run(), run()]);

    expect(r1.charged + r2.charged).toBe(2);
    expect(await count('orders')).toBe(2);
    expect(h.checkoutCalls).toHaveLength(2);
    expect(await count('orders', `where source_ref = 'subscription:${SUB}'`)).toBe(1);
    expect(await count('orders', `where source_ref = 'subscription:${SUB2}'`)).toBe(1);
  });

  it('pawpi_app can call the advisory-lock functions the guard relies on', async () => {
    const [row] = await appSql.begin(
      (tx: any) => tx`select pg_try_advisory_xact_lock(hashtext('sub-charge'), 1) as locked`,
    );
    expect(row.locked).toBe(true);
  });
});
