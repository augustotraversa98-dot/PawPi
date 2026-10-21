// Payment settlement on REAL Postgres as pawpi_app with NO request identity — exactly the webhook's position
// (flow matrix F3-01; migration 0135). The mocked unit suites could never catch this class of bug (they stub `sql`);
// the sibling payments-rls suite even asserts "no identity -> ZERO rows" on payments/orders, which is WHY the
// webhook never found a payment.
//
// Two layers:
//   1. the SECURITY DEFINER functions directly (app_payment_for_webhook / app_apply_payment_status): lookup,
//      settle once, duplicate, out-of-order, refund after approval, once-only stock / walk credits / booking
//      auto-confirm, row-lock concurrency, and the grant surface (verify_0135.sql run for real);
//   2. handleWebhook + the real route end-to-end with a genuinely HMAC-signed MercadoPago notification and a
//      stubbed MercadoPago payments API (only the outbound HTTP is faked).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedOwnerWithPet,
  seedProvider,
  seedPaymentAccount,
  seedOrder,
  seedPayment,
  seedShopProduct,
  seedBooking,
  MIGRATIONS_DIR,
} from './db';

const OWNER = { authUserId: 1, profileId: 1, username: 'payer', petId: 1, petName: 'Rex' };
const SELLER = { authUserId: 2, profileId: 2, username: 'seller' };
const P = 10; // provider being paid

const WEBHOOK_SECRET = 'whsecret-integration';
const MP_PAYMENT_ID = '1320000000001'; // synthetic MercadoPago payment id

let raw: Sql; // superuser (seeding + assertions that bypass RLS)
let app: Sql; // pawpi_app, NO identity — the webhook's connection
let app2: Sql; // a second pawpi_app connection (concurrency)
let payments: any; // the real payment layer (uses the singleton `sql` as pawpi_app)
let routePost: (req: Request) => Promise<Response>;

function connectApp(): Sql {
  const url = new URL(inject('TEST_DATABASE_URL'));
  return postgres({
    host: url.hostname,
    port: Number(url.port),
    database: url.pathname.replace(/^\//, ''),
    username: 'pawpi_app',
    password: 'pawpi_app',
    max: 1,
    onnotice: () => {},
  });
}

beforeAll(async () => {
  raw = makeTestSql();
  app = connectApp();
  app2 = connectApp();

  const url = new URL(inject('TEST_DATABASE_URL'));
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'disable';
  process.env.MP_CLIENT_ID = 'cid';
  process.env.MP_CLIENT_SECRET = 'csecret';
  process.env.MP_WEBHOOK_SECRET = WEBHOOK_SECRET;
  delete process.env.PAYMENTS_TOKEN_KEY; // legacy plaintext tokens pass through decryptToken
  payments = await import('../../src/app/api/utils/payments');
  ({ POST: routePost } = (await import('../../src/app/api/payments/webhooks/mercadopago/route')) as any);
});
afterAll(async () => {
  await app.end();
  await app2.end();
  await raw.end();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await resetDb(raw);
});
beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  await raw`insert into auth_users (id, name, email) values (${SELLER.authUserId}, 'seller', 'seller@example.com')`;
  await raw`insert into user_profiles (id, auth_user_id, username, onboarding_completed) values (${SELLER.profileId}, ${SELLER.authUserId}, 'seller', true)`;
  await seedProvider(raw, { providerId: P, ownerUserProfileId: SELLER.profileId, slug: 'prov-p' });
});

// ── helpers ──────────────────────────────────────────────────────────────────
const apply = (c: Sql, paymentId: number, status: string, rawStatus: string | null = status) =>
  c`select * from app_apply_payment_status(${paymentId}::int, ${status}::text, ${rawStatus}::text)`;
const find = (ref: string) => app`select * from app_payment_for_webhook(${ref}::text)`;
const order = async (id: number) => (await raw`select status from orders where id = ${id}`)[0].status as string;
const pay = async (id: number) => (await raw`select status, raw_status from payments where id = ${id}`)[0];
const stock = async (id: number) => (await raw`select stock_qty from shop_products where id = ${id}`)[0].stock_qty as number;

async function seedBookingOrder(opts: { orderId: number; paymentId: number; externalId?: string; kind?: any; amountCents?: number }) {
  await seedOrder(raw, { orderId: opts.orderId, ownerUserId: OWNER.profileId, providerId: P, kind: opts.kind ?? 'booking', amountCents: opts.amountCents });
  await seedPayment(raw, { paymentId: opts.paymentId, orderId: opts.orderId, externalId: opts.externalId ?? `pref-${opts.orderId}` });
}

// A product order for 3 units of a 10-unit product.
async function seedProductOrder(orderId = 100, paymentId = 1000) {
  await seedShopProduct(raw, { productId: 7, providerId: P, stockQty: 10 });
  await seedBookingOrder({ orderId, paymentId, kind: 'product' });
  await raw`insert into order_items (order_id, name, quantity, unit_cents, product_id) values (${orderId}, 'Kibble', 3, 3000, 7)`;
}

// ── the bug itself ───────────────────────────────────────────────────────────
describe('the F3-01 bug, reproduced and closed', () => {
  it('with NO identity pawpi_app cannot see payments/orders directly (this is why the webhook found nothing)…', async () => {
    await seedBookingOrder({ orderId: 100, paymentId: 1000 });
    expect(await app`select id from payments where id = 1000`).toHaveLength(0);
    expect(await app`select id from orders where id = 100`).toHaveLength(0);
    // …and an unprivileged UPDATE would silently touch zero rows
    expect((await app`update orders set status = 'paid' where id = 100`).count).toBe(0);
    expect(await order(100)).toBe('pending');
  });

  it('…but the DEFINER pair finds it and settles it, with no identity', async () => {
    await seedBookingOrder({ orderId: 100, paymentId: 1000, externalId: 'pref-xyz' });
    const found = await find('pref-xyz');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: 1000, order_id: 100, provider_id: P, rail: 'mercadopago', status: 'pending', external_id: 'pref-xyz' });

    const [r] = await apply(app, 1000, 'approved');
    expect(r).toMatchObject({ applied: true, out_order_id: 100, prev_order_status: 'pending', new_order_status: 'paid' });
    expect(await order(100)).toBe('paid');
    expect((await pay(1000)).status).toBe('approved');
  });
});

// ── app_payment_for_webhook ──────────────────────────────────────────────────
describe('app_payment_for_webhook', () => {
  beforeEach(async () => {
    await seedBookingOrder({ orderId: 100, paymentId: 1000, externalId: 'pref-abc' });
    await raw`update payments set idempotency_key = 'order-100' where id = 1000`;
  });

  it.each([
    ['external_id', 'pref-abc'],
    ['idempotency_key', 'order-100'],
    ['the ORDER id (MercadoPago external_reference)', '100'],
  ])('finds the payment by %s', async (_n, ref) => {
    expect((await find(ref))[0]).toMatchObject({ id: 1000, order_id: 100 });
  });

  it.each([['nope'], ['999'], [''], ['order-999'], ['1e3'], ['12345678901234567890'], ['100; drop table payments']])(
    'returns zero rows for an unknown / hostile reference %j (and never a cast error)',
    async (ref) => {
      expect(await find(ref)).toHaveLength(0);
    },
  );

  it('prefers an exact external_id match over a coincidental order-id match', async () => {
    await seedOrder(raw, { orderId: 200, ownerUserId: OWNER.profileId, providerId: P });
    await seedPayment(raw, { paymentId: 2000, orderId: 200, externalId: '100' }); // external_id "100" ≠ order 100
    expect((await find('100'))[0].id).toBe(2000);
  });

  it('with several payments on one order it returns the most recent', async () => {
    await seedPayment(raw, { paymentId: 1001, orderId: 100, externalId: 'pref-retry' });
    expect((await find('100'))[0].id).toBe(1001);
  });

  it('null reference → zero rows', async () => {
    expect(await app`select * from app_payment_for_webhook(${null}::text)`).toHaveLength(0);
  });
});

// ── app_apply_payment_status ─────────────────────────────────────────────────
describe('app_apply_payment_status — settle once, monotonic', () => {
  it('settle once, then the SAME event again changes nothing', async () => {
    await seedBookingOrder({ orderId: 100, paymentId: 1000 });
    const [first] = await apply(app, 1000, 'approved');
    const before = (await raw`select updated_at from payments where id = 1000`)[0].updated_at;
    const [second] = await apply(app, 1000, 'approved');
    const after = (await raw`select updated_at from payments where id = 1000`)[0].updated_at;

    expect(first.applied).toBe(true);
    expect(second).toMatchObject({ applied: false, prev_payment_status: 'approved', new_payment_status: 'approved' });
    expect(after).toEqual(before); // truly untouched
    expect(await order(100)).toBe('paid');
  });

  it.each([['pending'], ['failed']])('OUT OF ORDER: approved then %s is ignored (a paid order never regresses)', async (late) => {
    await seedBookingOrder({ orderId: 100, paymentId: 1000 });
    await apply(app, 1000, 'approved');
    const [r] = await apply(app, 1000, late);
    expect(r.applied).toBe(false);
    expect((await pay(1000)).status).toBe('approved');
    expect(await order(100)).toBe('paid');
  });

  it('REFUND after approval: payment + order -> refunded', async () => {
    await seedBookingOrder({ orderId: 100, paymentId: 1000 });
    await apply(app, 1000, 'approved');
    const [r] = await apply(app, 1000, 'refunded');
    expect(r).toMatchObject({ applied: true, prev_order_status: 'paid', new_order_status: 'refunded' });
    expect((await pay(1000)).status).toBe('refunded');
    expect(await order(100)).toBe('refunded');
  });

  it.each([['approved'], ['pending'], ['failed']])('refunded is TERMINAL: a late %s cannot re-pay or regress it', async (late) => {
    await seedBookingOrder({ orderId: 100, paymentId: 1000 });
    await apply(app, 1000, 'approved');
    await apply(app, 1000, 'refunded');
    const [r] = await apply(app, 1000, late);
    expect(r.applied).toBe(false);
    expect((await pay(1000)).status).toBe('refunded');
    expect(await order(100)).toBe('refunded');
  });

  it('a failed attempt can still be paid later (the customer retried with another card)', async () => {
    await seedBookingOrder({ orderId: 100, paymentId: 1000 });
    await apply(app, 1000, 'failed', 'rejected');
    expect(await order(100)).toBe('failed');
    const [r] = await apply(app, 1000, 'approved');
    expect(r.applied).toBe(true);
    expect(await order(100)).toBe('paid');
  });

  it('pending -> pending is a no-op; pending leaves the order pending', async () => {
    await seedBookingOrder({ orderId: 100, paymentId: 1000 });
    expect((await apply(app, 1000, 'pending', 'in_process'))[0].applied).toBe(false);
    expect(await order(100)).toBe('pending');
  });

  it('keeps the rail raw status verbatim', async () => {
    await seedBookingOrder({ orderId: 100, paymentId: 1000 });
    await apply(app, 1000, 'failed', 'cc_rejected');
    expect((await pay(1000)).raw_status).toBe('cc_rejected');
  });

  it('an unknown payment id returns zero rows; an invalid status raises (22023) and changes nothing', async () => {
    expect(await apply(app, 424242, 'approved')).toHaveLength(0);
    await seedBookingOrder({ orderId: 100, paymentId: 1000 });
    await expect(apply(app, 1000, 'banana')).rejects.toMatchObject({ code: '22023' });
    expect((await pay(1000)).status).toBe('pending');
  });

  it('two payment rows on one order: a second approval / refund of the other never regresses a settled order', async () => {
    await seedProductOrder(100, 1000);
    await seedPayment(raw, { paymentId: 1001, orderId: 100, externalId: 'pref-second' });
    await apply(app, 1000, 'approved');
    await apply(app, 1001, 'approved'); // order already paid: no second decrement
    expect(await stock(7)).toBe(7);
    await apply(app, 1000, 'refunded');
    await apply(app, 1001, 'approved'); // already approved + order refunded -> no-op
    expect(await order(100)).toBe('refunded');
  });
});

describe('once-only side effects', () => {
  it('product: stock decremented ONCE on paid (duplicate + late pending do nothing)', async () => {
    await seedProductOrder();
    await apply(app, 1000, 'approved');
    expect(await stock(7)).toBe(7);
    await apply(app, 1000, 'approved');
    await apply(app, 1000, 'pending');
    expect(await stock(7)).toBe(7);
  });

  it('product: refund restocks ONCE; a duplicate refund or a late approval does not move stock again', async () => {
    await seedProductOrder();
    await apply(app, 1000, 'approved');
    await apply(app, 1000, 'refunded');
    expect(await stock(7)).toBe(10);
    await apply(app, 1000, 'refunded');
    await apply(app, 1000, 'approved');
    expect(await stock(7)).toBe(10);
  });

  it('product: refunding something that was NEVER paid gives no phantom stock back', async () => {
    await seedProductOrder();
    await apply(app, 1000, 'refunded');
    expect(await stock(7)).toBe(10);
    expect(await order(100)).toBe('refunded');
  });

  it('walk package: credits granted ONCE on the first paid transition (duplicates + later events do not re-grant)', async () => {
    const [{ id: pkg }] = await raw`insert into walk_packages (provider_id, walks_count, price_cents) values (${P}, 5, 20000) returning id`;
    await seedOrder(raw, { orderId: 300, ownerUserId: OWNER.profileId, providerId: P, kind: 'walk_package' as any, amountCents: 20000 });
    await raw`update orders set source_ref = ${'walk_package:' + pkg} where id = 300`;
    await seedPayment(raw, { paymentId: 3000, orderId: 300, externalId: 'pref-w' });

    await apply(app, 3000, 'approved');
    await apply(app, 3000, 'approved');
    await apply(app, 3000, 'pending');
    const packs = await raw`select walks_total, walks_used, owner_user_id from walk_credit_packs where order_id = 300`;
    expect(packs).toEqual([{ walks_total: 5, walks_used: 0, owner_user_id: OWNER.profileId }]);
  });

  describe('booking confirmation (provider opted in to auto-confirm, 0079)', () => {
    async function seedPaidBookingOrder() {
      await seedBookingOrder({ orderId: 100, paymentId: 1000 });
      const { apptId } = await seedBooking(raw, { apptId: 500, petId: OWNER.petId, ownerUserId: OWNER.profileId, providerId: P });
      await raw`update vet_appointments set order_id = 100 where id = ${apptId}`;
      return apptId;
    }
    const bs = async (id: number) => (await raw`select booking_status from vet_appointments where id = ${id}`)[0].booking_status as string;

    it('auto-confirm ON: the paid booking becomes confirmed, exactly once, and the ids are reported', async () => {
      await raw`update providers set auto_confirm_bookings = true where id = ${P}`;
      const id = await seedPaidBookingOrder();
      const [r] = await apply(app, 1000, 'approved');
      expect(r.confirmed_booking_ids).toEqual([id]);
      expect(await bs(id)).toBe('confirmed');
      const [again] = await apply(app, 1000, 'approved');
      expect(again.confirmed_booking_ids).toEqual([]);
    });

    it('auto-confirm OFF (the default): the booking stays requested — the provider still accepts it (now possible: the order is paid)', async () => {
      const id = await seedPaidBookingOrder();
      const [r] = await apply(app, 1000, 'approved');
      expect(r.confirmed_booking_ids).toEqual([]);
      expect(await bs(id)).toBe('requested');
      expect(await order(100)).toBe('paid');
    });

    it('an owner-cancelled booking is NOT resurrected by a late payment', async () => {
      await raw`update providers set auto_confirm_bookings = true where id = ${P}`;
      const id = await seedPaidBookingOrder();
      await raw`update vet_appointments set status = 'cancelled', booking_status = 'cancelled' where id = ${id}`;
      await apply(app, 1000, 'approved');
      expect(await bs(id)).toBe('cancelled');
    });
  });

  it('CONCURRENT identical deliveries serialise on the row lock: exactly one applies, stock moves once', async () => {
    await seedProductOrder();
    const results = await Promise.all([apply(app, 1000, 'approved'), apply(app2, 1000, 'approved')]);
    expect(results.map((r) => r[0].applied).sort()).toEqual([false, true]);
    expect(await stock(7)).toBe(7);
    expect(await order(100)).toBe('paid');
  });
});

// ── grants: the surface a real attacker (Data API) would hit ─────────────────
describe('grants (verify_0135.sql, run for real)', () => {
  it('every verify row reads PASS against the migrated schema', async () => {
    const sqlText = await readFile(path.resolve(MIGRATIONS_DIR, '../verify_0135.sql'), 'utf8');
    const rows = await raw.unsafe(sqlText);
    expect(rows.length).toBeGreaterThanOrEqual(8);
    const failing = rows.filter((r: any) => r.status !== 'PASS');
    expect(failing, JSON.stringify(failing)).toEqual([]);
  });

  it('PUBLIC cannot execute either function; pawpi_app can', async () => {
    const r = await raw`
      select p.proname,
             has_function_privilege('pawpi_app', p.oid, 'EXECUTE') as app_ok,
             exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                     where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_ok
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname in ('app_payment_for_webhook', 'app_apply_payment_status')`;
    expect(r).toHaveLength(2);
    for (const row of r) {
      expect(row.app_ok).toBe(true);
      expect(row.public_ok).toBe(false);
    }
  });
});

// ── handleWebhook + the real route, signed, no identity ──────────────────────
describe('MercadoPago webhook end-to-end (real HMAC, real DB as pawpi_app without identity; only MP HTTP is stubbed)', () => {
  const sign = (dataId: string, requestId = 'req-1', ts = '1700000000') => ({
    'x-signature': `ts=${ts},v1=${createHmac('sha256', WEBHOOK_SECRET).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex')}`,
    'x-request-id': requestId,
  });
  const mpApi = (status: string, externalReference: string) =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: Number(MP_PAYMENT_ID), status, external_reference: externalReference }),
    } as any);
  // the notification as the route receives it: query string + JSON body
  const notification = (opts: { orderRef?: string | null; dataId?: string; headers?: Record<string, string> } = {}) => {
    const dataId = opts.dataId ?? MP_PAYMENT_ID;
    const params = new URLSearchParams();
    if (opts.orderRef !== null) params.set('order_ref', opts.orderRef ?? '100');
    params.set('data.id', dataId);
    params.set('type', 'payment');
    return new Request(`http://localhost/api/payments/webhooks/mercadopago?${params}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(opts.headers ?? sign(dataId)) },
      body: JSON.stringify({ action: 'payment.updated', api_version: 'v1', data: { id: dataId }, type: 'payment', live_mode: false }),
    });
  };

  beforeEach(async () => {
    await seedPaymentAccount(raw, { accountId: 1, providerId: P, accessToken: 'seller-token', accountRef: '2000000001' });
    await seedProductOrder(100, 1000);
    await raw`update payments set idempotency_key = 'order-100' where id = 1000`;
  });

  it('a signed "approved" notification settles the order — the real-payment-taken-but-unsettled bug', async () => {
    const f = mpApi('approved', '100');
    const res = await routePost(notification());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: 'approved', applied: true });
    expect(await order(100)).toBe('paid');
    expect((await pay(1000)).status).toBe('approved');
    expect(await stock(7)).toBe(7);
    expect(f.mock.calls[0][1]!.headers.authorization).toBe('Bearer seller-token'); // the SELLER's token
  });

  it('IDEMPOTENT: the same notification delivered twice changes nothing the second time', async () => {
    mpApi('approved', '100');
    await routePost(notification());
    const res = await routePost(notification());
    expect(await res.json()).toMatchObject({ ok: true, status: 'approved', applied: false });
    expect(await stock(7)).toBe(7);
    expect(await order(100)).toBe('paid');
  });

  it('OUT OF ORDER: approved, then a late "in_process" notification, leaves the order paid', async () => {
    mpApi('approved', '100');
    await routePost(notification());
    mpApi('in_process', '100');
    const res = await routePost(notification());
    expect((await res.json()).applied).toBe(false);
    expect(await order(100)).toBe('paid');
    expect((await pay(1000)).status).toBe('approved');
  });

  it('REFUND after approval: a signed "refunded" notification refunds the order and restocks once', async () => {
    mpApi('approved', '100');
    await routePost(notification());
    mpApi('refunded', '100');
    const res = await routePost(notification());
    expect(await res.json()).toMatchObject({ status: 'refunded', applied: true });
    expect(await order(100)).toBe('refunded');
    expect(await stock(7)).toBe(10);
    await routePost(notification()); // redelivery
    expect(await stock(7)).toBe(10);
  });

  it('rejected / cancelled -> the order is marked failed (no stock or credit movement)', async () => {
    mpApi('rejected', '100');
    await routePost(notification());
    expect(await order(100)).toBe('failed');
    expect(await stock(7)).toBe(10);
  });

  it('INVALID signature → 401, and NOTHING changes (no lookup side effects, no MercadoPago call)', async () => {
    const f = mpApi('approved', '100');
    const res = await routePost(notification({ headers: { 'x-signature': 'ts=1700000000,v1=deadbeef', 'x-request-id': 'req-1' } }));
    expect(res.status).toBe(401);
    expect(f).not.toHaveBeenCalled();
    expect(await order(100)).toBe('pending');
  });

  it('UNSIGNED request → 401', async () => {
    mpApi('approved', '100');
    const res = await routePost(notification({ headers: {} }));
    expect(res.status).toBe(401);
    expect(await order(100)).toBe('pending');
  });

  it('UNKNOWN reference → 200 acknowledged, nothing changes', async () => {
    const f = mpApi('approved', '100');
    const res = await routePost(notification({ orderRef: '987654' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ignored' });
    expect(f).not.toHaveBeenCalled();
    expect(await order(100)).toBe('pending');
  });

  it('a payment that belongs to a DIFFERENT order than the located one is ignored (forged order_ref)', async () => {
    mpApi('approved', '555'); // MercadoPago says this payment is for order 555, not 100
    const res = await routePost(notification());
    expect(await res.json()).toMatchObject({ status: 'ignored', reason: 'reference_mismatch' });
    expect(await order(100)).toBe('pending');
  });

  it('MercadoPago API failure → 500 so MercadoPago redelivers; nothing changes; the retry then settles', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 502, json: async () => ({}) } as any);
    expect((await routePost(notification())).status).toBe(500);
    expect(await order(100)).toBe('pending');

    mpApi('approved', '100');
    expect((await routePost(notification())).status).toBe(200);
    expect(await order(100)).toBe('paid');
  });

  it('a non-payment topic (merchant_order) is acknowledged and settles nothing', async () => {
    const f = mpApi('approved', '100');
    const params = new URLSearchParams({ order_ref: '100', id: '55000000001', topic: 'merchant_order' });
    const res = await routePost(
      new Request(`http://localhost/api/payments/webhooks/mercadopago?${params}`, {
        method: 'POST',
        headers: sign('55000000001'),
        body: JSON.stringify({ resource: 'https://api.mercadopago.com/merchant_orders/55000000001', topic: 'merchant_order' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ignored', reason: 'unsupported_topic' });
    expect(f).not.toHaveBeenCalled();
    expect(await order(100)).toBe('pending');
  });

  it('handleWebhook called directly behaves the same (the layer, not just the route)', async () => {
    mpApi('approved', '100');
    const body = { type: 'payment', data: { id: MP_PAYMENT_ID } };
    const res = await payments.handleWebhook('mercadopago', {
      headers: sign(MP_PAYMENT_ID),
      rawBody: JSON.stringify(body),
      body,
      query: { 'data.id': MP_PAYMENT_ID, type: 'payment', order_ref: '100' },
    });
    expect(res).toMatchObject({ ok: true, status: 'approved', applied: true });
    expect(await order(100)).toBe('paid');
  });
});
