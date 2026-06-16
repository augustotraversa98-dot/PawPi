import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  platformCommissionBps,
  commissionCents,
  mercadopagoConfig,
  binanceConfig,
  railConfig,
  isRailConfigured,
  SUPPORTED_RAILS,
  PaymentsNotConfiguredError,
} from './config';

// payments/config — env-key reading + commission math (ticket 2.3). The "not configured"
// path is the critical safety property: missing keys must yield null/0, NEVER a crash.

const PAYMENT_ENV = [
  'PLATFORM_COMMISSION_BPS',
  'MP_CLIENT_ID',
  'MP_CLIENT_SECRET',
  'MP_WEBHOOK_SECRET',
  'MP_REDIRECT_URI',
  'BINANCE_PAY_API_KEY',
  'BINANCE_PAY_API_SECRET',
];

let saved;
beforeEach(() => {
  saved = {};
  for (const k of PAYMENT_ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of PAYMENT_ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('commission', () => {
  it('defaults to 0 bps when unset (never crashes)', () => {
    expect(platformCommissionBps()).toBe(0);
    expect(commissionCents(10000)).toBe(0);
  });

  it('computes floor commission from bps', () => {
    process.env.PLATFORM_COMMISSION_BPS = '500'; // 5%
    expect(platformCommissionBps()).toBe(500);
    expect(commissionCents(10000)).toBe(500); // 5% of $100.00
    expect(commissionCents(199)).toBe(9); // floor(9.95)
  });

  it('a negative/garbage bps falls back to 0', () => {
    process.env.PLATFORM_COMMISSION_BPS = 'nope';
    expect(platformCommissionBps()).toBe(0);
  });
});

describe('rail config — not configured path', () => {
  it('mercadopago returns null when any key is missing', () => {
    expect(mercadopagoConfig()).toBeNull();
    process.env.MP_CLIENT_ID = 'a';
    process.env.MP_CLIENT_SECRET = 'b';
    expect(mercadopagoConfig()).toBeNull(); // webhook secret still missing
  });

  it('mercadopago resolves when all required keys are set', () => {
    process.env.MP_CLIENT_ID = 'a';
    process.env.MP_CLIENT_SECRET = 'b';
    process.env.MP_WEBHOOK_SECRET = 'c';
    expect(mercadopagoConfig()).toMatchObject({
      clientId: 'a',
      clientSecret: 'b',
      webhookSecret: 'c',
    });
  });

  it('binance returns null without both keys, resolves with them', () => {
    expect(binanceConfig()).toBeNull();
    process.env.BINANCE_PAY_API_KEY = 'k';
    process.env.BINANCE_PAY_API_SECRET = 's';
    expect(binanceConfig()).toMatchObject({ apiKey: 'k', apiSecret: 's' });
  });

  it('railConfig dispatches per rail and isRailConfigured reflects it', () => {
    expect(isRailConfigured('mercadopago')).toBe(false);
    expect(isRailConfigured('binance')).toBe(false);
    expect(railConfig('unknown')).toBeNull();
    process.env.BINANCE_PAY_API_KEY = 'k';
    process.env.BINANCE_PAY_API_SECRET = 's';
    expect(isRailConfigured('binance')).toBe(true);
  });

  it('exposes BOTH rails (no single-rail hardcoding)', () => {
    expect(SUPPORTED_RAILS).toEqual(['mercadopago', 'binance']);
  });
});

describe('PaymentsNotConfiguredError', () => {
  it('is a 503-shaped error carrying the rail', () => {
    const e = new PaymentsNotConfiguredError('mercadopago');
    expect(e.status).toBe(503);
    expect(e.rail).toBe('mercadopago');
    expect(e.message).toMatch(/not configured/i);
  });
});
