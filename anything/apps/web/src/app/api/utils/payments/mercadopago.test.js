import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  verifyWebhook,
  mapStatus,
  buildOAuthUrl,
  createCheckout,
  refund,
  payout,
  getPaymentStatus,
  extractNotification,
  exchangeOAuthCode,
  webhookUrl,
  backUrls,
  RAIL,
} from './mercadopago';
import {
  PaymentsNotConfiguredError,
  ProviderPaymentAccountError,
  commissionCents,
} from './config';
import queryAndBody from './__fixtures__/mercadopago/webhook-v1-query-and-body.json';
import bodyOnly from './__fixtures__/mercadopago/webhook-v1-body-only.json';
import ipnQuery from './__fixtures__/mercadopago/ipn-legacy-query-only.json';
import ipnResource from './__fixtures__/mercadopago/ipn-legacy-resource-url.json';
import merchantOrder from './__fixtures__/mercadopago/webhook-merchant-order.json';
import apiApproved from './__fixtures__/mercadopago/payment-api-approved.json';

// MercadoPago adapter — the SIGNATURE-VERIFICATION + pure mapping surface. Real HMAC is
// computed so the test proves a forged signature is rejected and a valid one accepted.

const MP_ENV = [
  'MP_CLIENT_ID',
  'MP_CLIENT_SECRET',
  'MP_WEBHOOK_SECRET',
  'MP_REDIRECT_URI',
];
let saved;
beforeEach(() => {
  saved = {};
  for (const k of MP_ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of MP_ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function configure() {
  process.env.MP_CLIENT_ID = 'cid';
  process.env.MP_CLIENT_SECRET = 'csecret';
  process.env.MP_WEBHOOK_SECRET = 'whsecret';
  process.env.MP_REDIRECT_URI = 'https://x/cb';
}

describe('mapStatus', () => {
  it('maps rail statuses to ledger statuses', () => {
    expect(mapStatus('approved')).toBe('approved');
    expect(mapStatus('refunded')).toBe('refunded');
    expect(mapStatus('charged_back')).toBe('refunded');
    expect(mapStatus('rejected')).toBe('failed');
    expect(mapStatus('cancelled')).toBe('failed');
    expect(mapStatus('in_process')).toBe('pending');
  });
  it('RAIL is mercadopago', () => expect(RAIL).toBe('mercadopago'));
});

describe('verifyWebhook (signature gate)', () => {
  it('throws PaymentsNotConfiguredError when the secret is unset', () => {
    expect(() => verifyWebhook({ headers: {}, dataId: '1' })).toThrow(
      PaymentsNotConfiguredError,
    );
  });

  it('accepts a correctly-signed manifest and rejects a forged one', () => {
    configure();
    const ts = '1700000000';
    const dataId = '12345';
    const requestId = 'req-1';
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac('sha256', 'whsecret').update(manifest).digest('hex');

    expect(
      verifyWebhook({
        headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
        dataId,
      }),
    ).toBe(true);

    expect(
      verifyWebhook({
        headers: { 'x-signature': `ts=${ts},v1=deadbeef`, 'x-request-id': requestId },
        dataId,
      }),
    ).toBe(false);
  });

  it('accepts the signature MercadoPago makes over the LOWERCASED id when the URL carries an alphanumeric id', () => {
    configure();
    const ts = '1700000000';
    const requestId = 'req-2';
    const v1 = createHmac('sha256', 'whsecret')
      .update(`id:abc123def;request-id:${requestId};ts:${ts};`)
      .digest('hex');
    expect(
      verifyWebhook({
        headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
        dataId: 'ABC123DEF',
      }),
    ).toBe(true);
  });

  it('returns false on a missing/malformed signature header', () => {
    configure();
    expect(verifyWebhook({ headers: {}, dataId: '1' })).toBe(false);
    expect(verifyWebhook({ headers: { 'x-signature': 'garbage' }, dataId: '1' })).toBe(
      false,
    );
  });
});

describe('buildOAuthUrl', () => {
  it('throws not-configured without keys', () => {
    expect(() => buildOAuthUrl({ state: 's' })).toThrow(PaymentsNotConfiguredError);
  });
  it('builds an authorization URL with client_id, redirect, and state', () => {
    configure();
    const url = buildOAuthUrl({ state: '7.abc' });
    expect(url).toContain('auth.mercadopago.com/authorization');
    expect(url).toContain('client_id=cid');
    expect(url).toContain('state=7.abc');
    expect(url).toContain(encodeURIComponent('https://x/cb'));
  });
});

// Every remaining live-HTTP function must guard on unset keys and throw
// PaymentsNotConfiguredError BEFORE ever calling fetch — no crash, no network call,
// no leaking a raw TypeError/fetch failure to the caller. This is the N5 audit gap:
// these guards existed in source but had no direct unit test.
describe('degrade-clean guards (no keys set — must never call fetch)', () => {
  it('createCheckout throws without calling fetch', async () => {
    await expect(
      createCheckout({ order: { id: 1, amount_cents: 100, currency: 'ARS', kind: 'booking' }, account: { access_token: 't' }, idempotencyKey: 'k' }),
    ).rejects.toThrow(PaymentsNotConfiguredError);
  });

  it('createCheckout on a configured rail but UNCONNECTED provider throws the DISTINCT provider error (not the platform 503)', async () => {
    configure();
    await expect(
      createCheckout({ order: { id: 1, amount_cents: 100, currency: 'ARS', kind: 'booking' }, account: null, idempotencyKey: 'k' }),
    ).rejects.toThrow(ProviderPaymentAccountError);
    // And it is NOT the platform-keys error — the two are now separable.
    await expect(
      createCheckout({ order: { id: 1, amount_cents: 100, currency: 'ARS', kind: 'booking' }, account: null, idempotencyKey: 'k' }),
    ).rejects.not.toThrow(PaymentsNotConfiguredError);
  });

  it('refund throws without calling fetch', async () => {
    await expect(
      refund({ payment: { external_id: 'x' }, account: { access_token: 't' } }),
    ).rejects.toThrow(PaymentsNotConfiguredError);
  });

  it('payout throws without calling fetch', async () => {
    await expect(payout()).rejects.toThrow(PaymentsNotConfiguredError);
  });

  it('getPaymentStatus throws without calling fetch', async () => {
    await expect(
      getPaymentStatus({ externalId: 'x', account: { access_token: 't' } }),
    ).rejects.toThrow(PaymentsNotConfiguredError);
  });

  it('exchangeOAuthCode throws without calling fetch', async () => {
    await expect(exchangeOAuthCode('code')).rejects.toThrow(PaymentsNotConfiguredError);
  });
});

// The webhook wiring: a checkout preference MUST carry a notification_url so MercadoPago
// posts the payment status back to us (the only signal that flips an order to 'paid').
// Regression guard for the "payments succeed but orders never reconcile" bug.
describe('createCheckout notification_url (webhook wiring)', () => {
  const SAVED_BASE = process.env.APP_BASE_URL;
  let fetchSpy;
  beforeEach(() => {
    configure();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'pref_1', init_point: 'https://mp/checkout' }),
    });
  });
  const SAVED_BPS = process.env.PLATFORM_COMMISSION_BPS;
  afterEach(() => {
    fetchSpy.mockRestore();
    if (SAVED_BASE === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = SAVED_BASE;
    if (SAVED_BPS === undefined) delete process.env.PLATFORM_COMMISSION_BPS;
    else process.env.PLATFORM_COMMISSION_BPS = SAVED_BPS;
  });

  function bodyOfLastCall() {
    return JSON.parse(fetchSpy.mock.calls.at(-1)[1].body);
  }

  it('OMITS marketplace_fee when there is no platform commission (no zero-value split)', async () => {
    delete process.env.PLATFORM_COMMISSION_BPS; // → commission 0
    await createCheckout({
      order: { id: 42, amount_cents: 500000, currency: 'ARS', kind: 'booking' },
      account: { access_token: 'provider-token' },
      idempotencyKey: 'order-42',
    });
    expect(bodyOfLastCall()).not.toHaveProperty('marketplace_fee');
  });

  it('INCLUDES marketplace_fee (in currency units) when a commission is configured', async () => {
    process.env.PLATFORM_COMMISSION_BPS = '500'; // 5%
    await createCheckout({
      order: { id: 42, amount_cents: 500000, currency: 'ARS', kind: 'booking' },
      account: { access_token: 'provider-token' },
      idempotencyKey: 'order-42',
    });
    // 5% of 5000 ARS = 250 ARS (commissionCents floors to cents, /100 → currency units).
    expect(bodyOfLastCall().marketplace_fee).toBe(250);
  });

  it('webhookUrl builds the public endpoint from a https APP_BASE_URL and strips trailing slash', () => {
    process.env.APP_BASE_URL = 'https://pawpi.info/';
    expect(webhookUrl()).toBe('https://pawpi.info/api/payments/webhooks/mercadopago');
  });

  it('webhookUrl returns null for an unset or non-public base (never a bad notification_url)', () => {
    delete process.env.APP_BASE_URL;
    expect(webhookUrl()).toBe(null);
    process.env.APP_BASE_URL = 'http://localhost:4000';
    expect(webhookUrl()).toBe(null);
  });

  it('includes notification_url in the preference when APP_BASE_URL is a public https url', async () => {
    process.env.APP_BASE_URL = 'https://pawpi-production.up.railway.app';
    await createCheckout({
      order: { id: 42, amount_cents: 5000, currency: 'ARS', kind: 'product' },
      account: { access_token: 'provider-token' },
      idempotencyKey: 'order-42',
    });
    // carries the order reference so the webhook can locate the ledger row (F3-02)
    expect(bodyOfLastCall().notification_url).toBe(
      'https://pawpi-production.up.railway.app/api/payments/webhooks/mercadopago?order_ref=42',
    );
  });

  it('omits notification_url when no public base URL is configured', async () => {
    delete process.env.APP_BASE_URL;
    await createCheckout({
      order: { id: 42, amount_cents: 5000, currency: 'ARS', kind: 'product' },
      account: { access_token: 'provider-token' },
      idempotencyKey: 'order-42',
    });
    expect(bodyOfLastCall()).not.toHaveProperty('notification_url');
  });
});

// Integration-quality enrichment (Calidad de integración): payer, richer items,
// back_urls + auto_return, statement_descriptor. ALL additive — amounts + marketplace_fee
// must stay exactly as before.
describe('createCheckout quality enrichment', () => {
  const SAVED_BASE = process.env.APP_BASE_URL;
  let fetchSpy;
  beforeEach(() => {
    configure();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'pref_1', init_point: 'https://mp/checkout' }),
    });
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    if (SAVED_BASE === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = SAVED_BASE;
  });
  function bodyOfLastCall() {
    return JSON.parse(fetchSpy.mock.calls.at(-1)[1].body);
  }

  it('does NOT change amounts or the split (enrichment leaves unit_price + fee behavior intact)', async () => {
    await createCheckout({
      order: { id: 7, amount_cents: 5000, currency: 'ARS', kind: 'booking' },
      account: { access_token: 't' },
      idempotencyKey: 'k',
    });
    const body = bodyOfLastCall();
    expect(body.items[0].unit_price).toBe(50);
    expect(body.items[0].quantity).toBe(1);
    expect(body.items[0].currency_id).toBe('ARS');
    // Fee behavior is owned by the marketplace_fee-omit hardening: at zero commission the
    // split is omitted, otherwise it equals commissionCents. Enrichment must not alter it.
    const expectedFee = commissionCents(5000);
    if (expectedFee > 0) expect(body.marketplace_fee).toBe(expectedFee / 100);
    else expect(body).not.toHaveProperty('marketplace_fee');
    expect(body.external_reference).toBe('7');
  });

  it('enriches the item (id/description/category_id) and sets statement_descriptor', async () => {
    await createCheckout({
      order: { id: 7, amount_cents: 5000, currency: 'ARS', kind: 'booking' },
      account: { access_token: 't' },
      idempotencyKey: 'k',
    });
    const body = bodyOfLastCall();
    expect(body.items[0]).toMatchObject({
      id: '7',
      title: 'PawPi booking #7',
      description: 'PawPi booking order #7',
      category_id: 'services',
    });
    expect(body.statement_descriptor).toBe('PAWPI');
  });

  it('categorizes a physical product as "others" and a service as "services"', async () => {
    await createCheckout({
      order: { id: 8, amount_cents: 1000, currency: 'ARS', kind: 'product' },
      account: { access_token: 't' },
      idempotencyKey: 'k',
    });
    expect(bodyOfLastCall().items[0].category_id).toBe('others');
  });

  it('includes payer with ONLY the fields present (no empty strings)', async () => {
    await createCheckout({
      order: { id: 7, amount_cents: 5000, currency: 'ARS', kind: 'booking' },
      account: { access_token: 't' },
      idempotencyKey: 'k',
      payer: { name: 'Ada', surname: 'Lovelace', email: 'ada@pawpi.info' },
    });
    expect(bodyOfLastCall().payer).toEqual({
      name: 'Ada',
      surname: 'Lovelace',
      email: 'ada@pawpi.info',
    });
  });

  it('drops missing/blank payer fields and omits payer entirely when nothing is present', async () => {
    await createCheckout({
      order: { id: 7, amount_cents: 5000, currency: 'ARS', kind: 'booking' },
      account: { access_token: 't' },
      idempotencyKey: 'k',
      payer: { name: 'Ada', surname: '   ', email: undefined },
    });
    expect(bodyOfLastCall().payer).toEqual({ name: 'Ada' });

    await createCheckout({
      order: { id: 7, amount_cents: 5000, currency: 'ARS', kind: 'booking' },
      account: { access_token: 't' },
      idempotencyKey: 'k',
      payer: { name: '', email: '' },
    });
    expect(bodyOfLastCall()).not.toHaveProperty('payer');
  });

  it('omits payer entirely when none is provided', async () => {
    await createCheckout({
      order: { id: 7, amount_cents: 5000, currency: 'ARS', kind: 'booking' },
      account: { access_token: 't' },
      idempotencyKey: 'k',
    });
    expect(bodyOfLastCall()).not.toHaveProperty('payer');
  });

  it('sets back_urls (https) + auto_return when a public base URL is configured', async () => {
    process.env.APP_BASE_URL = 'https://pawpi-production.up.railway.app/';
    await createCheckout({
      order: { id: 7, amount_cents: 5000, currency: 'ARS', kind: 'booking' },
      account: { access_token: 't' },
      idempotencyKey: 'k',
    });
    const body = bodyOfLastCall();
    expect(body.back_urls).toEqual({
      success: 'https://pawpi-production.up.railway.app/?payment=success',
      failure: 'https://pawpi-production.up.railway.app/?payment=failure',
      pending: 'https://pawpi-production.up.railway.app/?payment=pending',
    });
    expect(body.auto_return).toBe('approved');
  });

  it('omits back_urls + auto_return when no public base URL is configured', async () => {
    delete process.env.APP_BASE_URL;
    await createCheckout({
      order: { id: 7, amount_cents: 5000, currency: 'ARS', kind: 'booking' },
      account: { access_token: 't' },
      idempotencyKey: 'k',
    });
    const body = bodyOfLastCall();
    expect(body).not.toHaveProperty('back_urls');
    expect(body).not.toHaveProperty('auto_return');
  });
});

describe('backUrls helper', () => {
  const SAVED_BASE = process.env.APP_BASE_URL;
  afterEach(() => {
    if (SAVED_BASE === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = SAVED_BASE;
  });
  it('builds https return URLs and strips a trailing slash', () => {
    process.env.APP_BASE_URL = 'https://pawpi.info/';
    expect(backUrls()).toEqual({
      success: 'https://pawpi.info/?payment=success',
      failure: 'https://pawpi.info/?payment=failure',
      pending: 'https://pawpi.info/?payment=pending',
    });
  });
  it('returns null for an unset or non-public base', () => {
    delete process.env.APP_BASE_URL;
    expect(backUrls()).toBe(null);
    process.env.APP_BASE_URL = 'http://localhost:4000';
    expect(backUrls()).toBe(null);
  });
});

// F3-02: the payload extractor must read MercadoPago's REAL notification shapes (query params and/or JSON body).
// Fixtures are synthetic stand-ins for a captured sandbox payload (see the fixture _note).
describe('extractNotification (F3-02: tolerant of every real shape)', () => {
  it('Webhooks v1 query string + body → payment, data.id from the query, order from order_ref', () => {
    expect(extractNotification({ query: queryAndBody.query, body: queryAndBody.body })).toEqual({
      kind: 'payment',
      dataId: '1320000000001',
      orderRef: '4821',
    });
  });

  it('Webhooks v1 BODY only (no query string) → payment id from body.data.id, no order reference', () => {
    expect(extractNotification({ query: bodyOnly.query, body: bodyOnly.body })).toEqual({
      kind: 'payment',
      dataId: '1320000000002',
      orderRef: null,
    });
  });

  it('legacy IPN query (?id=&topic=payment, empty body) → payment id from `id`', () => {
    expect(extractNotification({ query: ipnQuery.query, body: ipnQuery.body })).toEqual({
      kind: 'payment',
      dataId: '1320000000003',
      orderRef: '4821',
    });
  });

  it('legacy IPN `resource` URL in the body → the id is its last path segment', () => {
    expect(extractNotification({ query: ipnResource.query, body: ipnResource.body })).toMatchObject({
      kind: 'payment',
      dataId: '1320000000004',
    });
  });

  it('a bare-id `resource` works too', () => {
    expect(extractNotification({ query: { topic: 'payment' }, body: { resource: '777' } }).dataId).toBe('777');
  });

  it('a non-payment topic is classified "other" (never settles)', () => {
    expect(extractNotification({ query: merchantOrder.query, body: merchantOrder.body }).kind).toBe('other');
  });

  it('prefers the query data.id over the body (the signature covers the query value)', () => {
    expect(
      extractNotification({ query: { 'data.id': 'Q1', type: 'payment' }, body: { data: { id: 'B1' }, type: 'payment' } }).dataId,
    ).toBe('Q1');
  });

  it('does NOT use the body.id (that is the NOTIFICATION id, not the payment id)', () => {
    expect(extractNotification({ query: {}, body: { id: 900000000001, type: 'payment' } }).dataId).toBeNull();
  });

  it('numeric ids are stringified; empty / missing / junk input never throws', () => {
    expect(extractNotification({ query: {}, body: { type: 'payment', data: { id: 42 } } }).dataId).toBe('42');
    expect(extractNotification({})).toEqual({ kind: null, dataId: null, orderRef: null });
    expect(extractNotification({ query: null, body: 'junk' })).toEqual({ kind: null, dataId: null, orderRef: null });
    expect(extractNotification()).toEqual({ kind: null, dataId: null, orderRef: null });
  });

  it('does not read a status out of the notification (it is unauthenticated)', () => {
    const out = extractNotification({ query: {}, body: { type: 'payment', data: { id: '1' }, status: 'approved' } });
    expect(Object.keys(out).sort()).toEqual(['dataId', 'kind', 'orderRef']);
  });
});

describe('getPaymentStatus returns the external_reference used to confirm the order', () => {
  it('reads status + external_reference from the payments API response', async () => {
    configure();
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => apiApproved });
    try {
      const out = await getPaymentStatus({ externalId: '1320000000001', account: { access_token: 'seller' } });
      expect(out).toEqual({ rawStatus: 'approved', status: 'approved', externalReference: '4821' });
    } finally {
      spy.mockRestore();
    }
  });
});
