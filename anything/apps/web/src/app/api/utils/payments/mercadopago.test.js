import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  verifyWebhook,
  mapStatus,
  buildOAuthUrl,
  createCheckout,
  refund,
  payout,
  getPaymentStatus,
  exchangeOAuthCode,
  RAIL,
} from './mercadopago';
import { PaymentsNotConfiguredError } from './config';

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

  it('createCheckout throws when configured but the provider has no connected account', async () => {
    configure();
    await expect(
      createCheckout({ order: { id: 1, amount_cents: 100, currency: 'ARS', kind: 'booking' }, account: null, idempotencyKey: 'k' }),
    ).rejects.toThrow(PaymentsNotConfiguredError);
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
