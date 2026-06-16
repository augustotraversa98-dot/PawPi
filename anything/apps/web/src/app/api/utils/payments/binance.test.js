import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyWebhook, mapStatus, RAIL } from './binance';
import { PaymentsNotConfiguredError } from './config';

// Binance Pay adapter — signature verification + pure mapping. Real HMAC-SHA512 over
// `${ts}\n${nonce}\n${body}\n` proves a forged signature is rejected.

const BIN_ENV = ['BINANCE_PAY_API_KEY', 'BINANCE_PAY_API_SECRET'];
let saved;
beforeEach(() => {
  saved = {};
  for (const k of BIN_ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of BIN_ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function configure() {
  process.env.BINANCE_PAY_API_KEY = 'k';
  process.env.BINANCE_PAY_API_SECRET = 's3cr3t';
}

describe('mapStatus', () => {
  it('maps bizStatus to ledger statuses', () => {
    expect(mapStatus('PAY_SUCCESS')).toBe('approved');
    expect(mapStatus('PAY_CLOSED')).toBe('failed');
    expect(mapStatus('PAY_EXPIRED')).toBe('failed');
    expect(mapStatus('REFUNDED')).toBe('refunded');
    expect(mapStatus('PAY_PROCESSING')).toBe('pending');
  });
  it('RAIL is binance', () => expect(RAIL).toBe('binance'));
});

describe('verifyWebhook (signature gate)', () => {
  it('throws not-configured without keys', () => {
    expect(() => verifyWebhook({ headers: {}, rawBody: '{}' })).toThrow(
      PaymentsNotConfiguredError,
    );
  });

  it('accepts a correctly-signed body and rejects a forged one', () => {
    configure();
    const ts = '1700000000000';
    const nonce = 'abc123';
    const rawBody = '{"bizStatus":"PAY_SUCCESS"}';
    const payload = `${ts}\n${nonce}\n${rawBody}\n`;
    const sig = createHmac('sha512', 's3cr3t').update(payload).digest('hex').toUpperCase();

    expect(
      verifyWebhook({
        headers: {
          'binancepay-timestamp': ts,
          'binancepay-nonce': nonce,
          'binancepay-signature': sig,
        },
        rawBody,
      }),
    ).toBe(true);

    expect(
      verifyWebhook({
        headers: {
          'binancepay-timestamp': ts,
          'binancepay-nonce': nonce,
          'binancepay-signature': 'DEADBEEF',
        },
        rawBody,
      }),
    ).toBe(false);
  });

  it('returns false on missing signature headers', () => {
    configure();
    expect(verifyWebhook({ headers: {}, rawBody: '{}' })).toBe(false);
  });
});
