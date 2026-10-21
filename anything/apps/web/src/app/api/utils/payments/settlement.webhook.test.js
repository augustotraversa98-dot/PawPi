import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

// MercadoPago webhook SETTLEMENT (flow matrix F3-01 / F3-02), exercised through handleWebhook with the REAL
// mercadopago adapter (real HMAC verification, real extractor, real status mapping) and only the two edges
// mocked: `sql` (the DB — we assert exactly which SECURITY DEFINER functions are called, in what order) and
// `fetch` (MercadoPago's GET /v1/payments/{id}). The status machine itself lives in SQL (0135) and is proven
// on real Postgres in test/integration/payment-settlement.integration.test.ts.
//
// Fixtures in __fixtures__/mercadopago are SYNTHETIC (modelled on MercadoPago's documented shapes, not captured
// from a live sandbox) — see the fixture _note and the 0135 runbook for how to capture a real one.

vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
import sql from '@/app/api/utils/sql';
import { handleWebhook } from './index';
import { PaymentsNotConfiguredError, ProviderPaymentAccountError } from './config';

import queryAndBody from './__fixtures__/mercadopago/webhook-v1-query-and-body.json';
import bodyOnly from './__fixtures__/mercadopago/webhook-v1-body-only.json';
import ipnQuery from './__fixtures__/mercadopago/ipn-legacy-query-only.json';
import merchantOrder from './__fixtures__/mercadopago/webhook-merchant-order.json';
import apiApproved from './__fixtures__/mercadopago/payment-api-approved.json';
import apiPending from './__fixtures__/mercadopago/payment-api-pending.json';
import apiRejected from './__fixtures__/mercadopago/payment-api-rejected.json';
import apiCancelled from './__fixtures__/mercadopago/payment-api-cancelled.json';
import apiRefunded from './__fixtures__/mercadopago/payment-api-refunded.json';
import apiOtherOrder from './__fixtures__/mercadopago/payment-api-other-order.json';

const SECRET = 'whsecret-test';
const MP_ENV = ['MP_CLIENT_ID', 'MP_CLIENT_SECRET', 'MP_WEBHOOK_SECRET', 'PAYMENTS_TOKEN_KEY'];
let saved;
let fetchSpy;
let db;

// What the (mocked) database holds + records.
function freshDb() {
  return {
    calls: [],
    payment: { id: 77, order_id: 4821, provider_id: 5, rail: 'mercadopago', status: 'pending', external_id: 'pref-1', amount_cents: 10000 },
    account: { provider_id: 5, rail: 'mercadopago', access_token: 'seller-token', refresh_token: null },
    apply: () => [{ applied: true, out_order_id: 4821, out_order_kind: 'booking', prev_payment_status: 'pending', new_payment_status: 'approved', prev_order_status: 'pending', new_order_status: 'paid', confirmed_booking_ids: [] }],
  };
}

const q = (strings) => strings.join('?');
const callsTo = (fn) => db.calls.filter((c) => c.text.includes(fn));

function sign({ dataId, requestId = 'req-1', ts = '1700000000', secret = SECRET }) {
  const v1 = createHmac('sha256', secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
  return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId };
}

// Build the payload the route hands handleWebhook from a fixture, signed over its data.id.
function deliver(fx, { signed = true, headers = {} } = {}) {
  const dataId = fx.query?.['data.id'] ?? fx.body?.data?.id ?? fx.query?.id;
  return {
    headers: { ...(fx.headers ?? {}), ...(signed ? sign({ dataId, requestId: fx.headers?.['x-request-id'] ?? 'req-1' }) : {}), ...headers },
    rawBody: JSON.stringify(fx.body ?? {}),
    body: fx.body ?? {},
    query: fx.query ?? {},
  };
}

function mpReturns(apiPayment) {
  fetchSpy.mockResolvedValue({ ok: true, json: async () => apiPayment });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  saved = {};
  for (const k of MP_ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.MP_CLIENT_ID = 'cid';
  process.env.MP_CLIENT_SECRET = 'csecret';
  process.env.MP_WEBHOOK_SECRET = SECRET;

  db = freshDb();
  sql.mockImplementation(async (strings) => {
    const text = q(strings);
    db.calls.push({ text });
    if (text.includes('app_payment_for_webhook')) return db.payment ? [db.payment] : [];
    if (text.includes('app_get_provider_payment_account')) return db.account ? [{ ...db.account }] : [];
    if (text.includes('app_apply_payment_status')) return db.apply();
    throw new Error(`unexpected sql in webhook path: ${text}`);
  });
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  mpReturns(apiApproved);
});
afterEach(() => {
  fetchSpy.mockRestore();
  for (const k of MP_ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('signature gate — before ANY DB call or outbound request', () => {
  it('an INVALID signature → 401, no DB, no MercadoPago call', async () => {
    const res = await handleWebhook('mercadopago', deliver(queryAndBody, { headers: { 'x-signature': 'ts=1700000000,v1=deadbeef' } }));
    expect(res).toMatchObject({ ok: false, reason: 'invalid_signature', status: 401 });
    expect(sql).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('an UNSIGNED request → 401, no DB, no MercadoPago call', async () => {
    const res = await handleWebhook('mercadopago', deliver(queryAndBody, { signed: false }));
    expect(res).toMatchObject({ ok: false, reason: 'invalid_signature', status: 401 });
    expect(sql).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a signature made with the WRONG secret → 401', async () => {
    const p = deliver(queryAndBody, { signed: false });
    p.headers = { ...p.headers, ...sign({ dataId: '1320000000001', secret: 'someone-elses-secret' }) };
    const res = await handleWebhook('mercadopago', p);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('a valid signature for a DIFFERENT data.id (replay against another payment) → 401', async () => {
    const p = deliver(queryAndBody, { signed: false });
    p.headers = { ...p.headers, ...sign({ dataId: '1320000009999' }) };
    const res = await handleWebhook('mercadopago', p);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('webhook secret unset → PaymentsNotConfiguredError (route → 503), never a crash', async () => {
    delete process.env.MP_WEBHOOK_SECRET;
    await expect(handleWebhook('mercadopago', deliver(queryAndBody))).rejects.toBeInstanceOf(PaymentsNotConfiguredError);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe('settle once — notification shapes', () => {
  it('Webhooks v1 (query data.id + JSON body): locate by order_ref → fetch with the SELLER token → apply approved', async () => {
    const res = await handleWebhook('mercadopago', deliver(queryAndBody));

    expect(res).toMatchObject({ ok: true, status: 'approved', applied: true });
    // located through the DEFINER, with the order reference — and BEFORE the account / apply calls
    const order = db.calls.map((c) => c.text);
    expect(order[0]).toContain('app_payment_for_webhook');
    expect(order[1]).toContain('app_get_provider_payment_account');
    expect(order[2]).toContain('app_apply_payment_status');
    expect(sql.mock.calls[0][1]).toBe('4821');
    // fetched the MP payment id from the query string with the seller's token (never the platform secret)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.mercadopago.com/v1/payments/1320000000001');
    expect(fetchSpy.mock.calls[0][1].headers.authorization).toBe('Bearer seller-token');
    // applied by payment id, status mapped from MercadoPago's reply, raw status kept verbatim
    const apply = sql.mock.calls[2];
    expect(apply.slice(1)).toEqual([77, 'approved', 'approved']);
  });

  it('Webhooks v1 BODY-ONLY with an external_reference hint is tolerated (no query string forwarded)', async () => {
    const fx = { ...bodyOnly, body: { ...bodyOnly.body, external_reference: '4821' } };
    const res = await handleWebhook('mercadopago', deliver(fx));
    expect(res).toMatchObject({ ok: true, status: 'approved' });
    expect(fetchSpy.mock.calls[0][0]).toContain('/v1/payments/1320000000002');
  });

  it('Webhooks v1 body-only with NO order reference → acknowledged-but-ignored (cannot locate), and loud in the logs', async () => {
    const res = await handleWebhook('mercadopago', deliver(bodyOnly));
    expect(res).toMatchObject({ ok: true, status: 'ignored', reason: 'unknown_reference' });
    expect(sql).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('legacy IPN (?id=…&topic=payment, empty body) that IS signed is understood too', async () => {
    const res = await handleWebhook('mercadopago', deliver(ipnQuery));
    expect(res).toMatchObject({ ok: true, status: 'approved' });
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.mercadopago.com/v1/payments/1320000000003');
  });

  it('a non-payment topic (merchant_order) is acknowledged and settles nothing — no DB, no MP call', async () => {
    const res = await handleWebhook('mercadopago', deliver(merchantOrder));
    expect(res).toMatchObject({ ok: true, status: 'ignored', reason: 'unsupported_topic' });
    expect(sql).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never trusts a status/external_reference placed in the (unauthenticated) body — MercadoPago is asked', async () => {
    const fx = { ...queryAndBody, body: { ...queryAndBody.body, status: 'approved', external_reference: '1' } };
    mpReturns(apiRejected);
    const res = await handleWebhook('mercadopago', deliver(fx));
    // body claims approved; the located order is from order_ref (4821, wins over the body hint); MP says rejected
    expect(res).toMatchObject({ ok: true, status: 'failed' });
    expect(sql.mock.calls[0][1]).toBe('4821');
    expect(sql.mock.calls[2].slice(1)).toEqual([77, 'failed', 'rejected']);
  });
});

describe('every MercadoPago status maps to the right ledger status', () => {
  it.each([
    [apiApproved, 'approved'],
    [apiRefunded, 'refunded'],
    [apiRejected, 'failed'],
    [apiCancelled, 'failed'],
    [apiPending, 'pending'],
  ])('%#: MP says %o → apply %s', async (apiPayment, expected) => {
    mpReturns(apiPayment);
    const res = await handleWebhook('mercadopago', deliver(queryAndBody));
    expect(res.status).toBe(expected);
    expect(sql.mock.calls[2][2]).toBe(expected);
    expect(sql.mock.calls[2][3]).toBe(apiPayment.status);
  });
});

describe('idempotency', () => {
  it('the SAME event delivered twice: the 2nd is applied:false (the DB guard no-ops) and still answers 200', async () => {
    const outcomes = [
      [{ applied: true, new_payment_status: 'approved' }],
      [{ applied: false, new_payment_status: 'approved' }], // DB: already approved → no-op
    ];
    db.apply = () => outcomes.shift();

    const first = await handleWebhook('mercadopago', deliver(queryAndBody));
    const second = await handleWebhook('mercadopago', deliver(queryAndBody));

    expect(first).toMatchObject({ ok: true, status: 'approved', applied: true });
    expect(second).toMatchObject({ ok: true, status: 'approved', applied: false });
    // each delivery performs exactly ONE settlement call; the JS layer holds no second copy of the guard
    expect(callsTo('app_apply_payment_status')).toHaveLength(2);
  });

  it('out-of-order (approved then pending): both go to the DB guard, which owns the decision — JS does not pre-filter', async () => {
    const outcomes = [
      [{ applied: true, new_payment_status: 'approved' }],
      [{ applied: false, new_payment_status: 'approved' }], // pending after approved → ignored by 0135
    ];
    db.apply = () => outcomes.shift();

    mpReturns(apiApproved);
    await handleWebhook('mercadopago', deliver(queryAndBody));
    mpReturns(apiPending);
    const late = await handleWebhook('mercadopago', deliver(queryAndBody));

    expect(late).toMatchObject({ ok: true, status: 'pending', applied: false });
    expect(sql.mock.calls.filter((c) => q(c[0]).includes('app_apply_payment_status')).map((c) => c[2])).toEqual(['approved', 'pending']);
  });
});

describe('refund / terminal handling', () => {
  it('refunded after approved is applied as refunded (the DB restocks / does not double-handle)', async () => {
    mpReturns(apiRefunded);
    db.payment = { ...db.payment, status: 'approved' };
    db.apply = () => [{ applied: true, new_payment_status: 'refunded', prev_order_status: 'paid', new_order_status: 'refunded' }];
    const res = await handleWebhook('mercadopago', deliver(queryAndBody));
    expect(res).toMatchObject({ ok: true, status: 'refunded', applied: true });
    expect(sql.mock.calls[2].slice(1)).toEqual([77, 'refunded', 'refunded']);
  });

  it('a payment that no longer exists when applying (deleted between lookup and apply) is applied:false, not a 500', async () => {
    db.apply = () => [];
    const res = await handleWebhook('mercadopago', deliver(queryAndBody));
    expect(res).toMatchObject({ ok: true, applied: false });
  });
});

describe('unknown / mismatched / failing — nothing settles wrongly, nothing real is dropped', () => {
  it('unknown reference → acknowledged (200), no MercadoPago call, no apply', async () => {
    db.payment = null;
    const res = await handleWebhook('mercadopago', deliver(queryAndBody));
    expect(res).toMatchObject({ ok: true, status: 'ignored', reason: 'unknown_reference' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(callsTo('app_apply_payment_status')).toHaveLength(0);
  });

  it('a located payment on a DIFFERENT rail is ignored', async () => {
    db.payment = { ...db.payment, rail: 'binance' };
    const res = await handleWebhook('mercadopago', deliver(queryAndBody));
    expect(res).toMatchObject({ ok: true, status: 'ignored', reason: 'unknown_reference' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("MercadoPago's payment belongs to ANOTHER order (misrouted / forged hint) → ignored, nothing applied", async () => {
    mpReturns(apiOtherOrder);
    const res = await handleWebhook('mercadopago', deliver(queryAndBody));
    expect(res).toMatchObject({ ok: true, status: 'ignored', reason: 'reference_mismatch' });
    expect(callsTo('app_apply_payment_status')).toHaveLength(0);
  });

  it('MercadoPago API error → THROWS (route answers 5xx → MercadoPago redelivers); nothing applied', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(handleWebhook('mercadopago', deliver(queryAndBody))).rejects.toThrow(/status fetch failed/);
    expect(callsTo('app_apply_payment_status')).toHaveLength(0);
  });

  it('seller has no connected account → THROWS ProviderPaymentAccountError (never silently dropped)', async () => {
    db.account = null;
    await expect(handleWebhook('mercadopago', deliver(queryAndBody))).rejects.toBeInstanceOf(ProviderPaymentAccountError);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(callsTo('app_apply_payment_status')).toHaveLength(0);
  });

  it('an apply error propagates (route → 5xx → redelivery), e.g. the migration is not applied yet', async () => {
    db.apply = () => {
      throw Object.assign(new Error('function app_apply_payment_status does not exist'), { code: '42883' });
    };
    await expect(handleWebhook('mercadopago', deliver(queryAndBody))).rejects.toThrow(/does not exist/);
  });
});

describe('never logs tokens or the webhook body', () => {
  it('no console output on the happy path contains the seller token or the raw body', async () => {
    const logs = [];
    console.error.mockImplementation((...a) => logs.push(a.join(' ')));
    vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));
    await handleWebhook('mercadopago', deliver(queryAndBody));
    await handleWebhook('mercadopago', deliver(bodyOnly));
    const all = logs.join('\n');
    expect(all).not.toContain('seller-token');
    expect(all).not.toContain('1320000000001');
    expect(all).not.toContain('2000000001');
  });
});
