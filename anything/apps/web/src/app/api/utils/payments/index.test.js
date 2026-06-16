import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The provider-agnostic payment LAYER — with MOCKED adapters + mocked sql. Proves:
//   - createCheckout inserts a pending payment via the chosen rail (no rail hardcoded)
//   - handleWebhook verifies the signature and flips payment + order status
//   - an INVALID signature changes nothing (401)
//   - getStatus / refund reconcile; payout records a payouts row
//   - a missing key surfaces PaymentsNotConfiguredError (the route turns it into 503)

vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
vi.mock('./mercadopago', () => ({
  RAIL: 'mercadopago',
  createCheckout: vi.fn(),
  verifyWebhook: vi.fn(),
  mapStatus: vi.fn(),
  getPaymentStatus: vi.fn(),
  refund: vi.fn(),
  payout: vi.fn(),
}));
vi.mock('./binance', () => ({
  RAIL: 'binance',
  createCheckout: vi.fn(),
  verifyWebhook: vi.fn(),
  mapStatus: vi.fn(),
  refund: vi.fn(),
  payout: vi.fn(),
}));

import sql from '@/app/api/utils/sql';
import * as mp from './mercadopago';
import * as binance from './binance';
import {
  createCheckout,
  handleWebhook,
  getStatus,
  refund,
  payout,
} from './index';
import { PaymentsNotConfiguredError } from './config';

const MP_ENV = ['MP_CLIENT_ID', 'MP_CLIENT_SECRET', 'MP_WEBHOOK_SECRET'];
const BIN_ENV = ['BINANCE_PAY_API_KEY', 'BINANCE_PAY_API_SECRET'];
let saved;

function configureMp() {
  process.env.MP_CLIENT_ID = 'a';
  process.env.MP_CLIENT_SECRET = 'b';
  process.env.MP_WEBHOOK_SECRET = 'c';
}
function configureBinance() {
  process.env.BINANCE_PAY_API_KEY = 'k';
  process.env.BINANCE_PAY_API_SECRET = 's';
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  saved = {};
  for (const k of [...MP_ENV, ...BIN_ENV]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of [...MP_ENV, ...BIN_ENV]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const ORDER = {
  id: 10,
  owner_user_id: 1,
  provider_id: 5,
  kind: 'booking',
  amount_cents: 10000,
  currency: 'ARS',
};

describe('createCheckout', () => {
  it('not configured → throws PaymentsNotConfiguredError (no DB)', async () => {
    await expect(
      createCheckout(ORDER, { rail: 'mercadopago', idempotencyKey: 'k1' }),
    ).rejects.toBeInstanceOf(PaymentsNotConfiguredError);
    expect(sql).not.toHaveBeenCalled();
  });

  it('mercadopago: loads the provider account, calls the adapter, inserts a pending payment', async () => {
    configureMp();
    const account = { access_token: 'tok' };
    sql.mockResolvedValueOnce([account]); // loadProviderAccount
    mp.createCheckout.mockResolvedValue({
      externalId: 'pref_1',
      checkoutUrl: 'https://mp/checkout',
      commissionCents: 500,
    });
    sql.mockResolvedValueOnce([{ id: 99, status: 'pending', rail: 'mercadopago' }]); // INSERT payment

    const res = await createCheckout(ORDER, {
      rail: 'mercadopago',
      idempotencyKey: 'k1',
    });

    expect(mp.createCheckout).toHaveBeenCalledWith({
      order: ORDER,
      account,
      idempotencyKey: 'k1',
    });
    expect(res.checkoutUrl).toBe('https://mp/checkout');
    expect(res.payment).toMatchObject({ id: 99, status: 'pending' });
    // The INSERT bound the order id, rail, external id, and idempotency key.
    const insertCall = sql.mock.calls[1];
    expect(insertCall[0].join(' ')).toContain('INSERT INTO payments');
    expect(insertCall).toEqual(
      expect.arrayContaining([10, 'mercadopago', 'pref_1', 'k1']),
    );
  });

  it('binance: no provider account lookup; checkout returns a deeplink/qr', async () => {
    configureBinance();
    binance.createCheckout.mockResolvedValue({
      externalId: 'prepay_1',
      checkoutUrl: 'https://bpay/checkout',
      deeplink: 'bnc://pay',
      qrContent: 'QRDATA',
      commissionCents: 0,
    });
    sql.mockResolvedValueOnce([{ id: 77, status: 'pending', rail: 'binance' }]); // INSERT only

    const res = await createCheckout(ORDER, { rail: 'binance', idempotencyKey: 'k2' });

    // No account lookup for binance — the only sql call is the INSERT.
    expect(sql).toHaveBeenCalledTimes(1);
    expect(res.deeplink).toBe('bnc://pay');
    expect(res.qrContent).toBe('QRDATA');
  });
});

describe('handleWebhook', () => {
  it('rejects an INVALID signature and changes nothing', async () => {
    configureMp();
    mp.verifyWebhook.mockReturnValue(false);

    const res = await handleWebhook('mercadopago', {
      headers: {},
      body: { data: { id: 'x' } },
    });

    expect(res).toMatchObject({ ok: false, reason: 'invalid_signature', status: 401 });
    expect(sql).not.toHaveBeenCalled(); // no reconciliation on a forged payload
  });

  it('verified approved webhook flips payment → approved and order → paid', async () => {
    configureMp();
    mp.verifyWebhook.mockReturnValue(true);
    mp.mapStatus.mockReturnValue('approved');
    sql.mockResolvedValueOnce([{ id: 99, order_id: 10, rail: 'mercadopago' }]); // findPayment
    sql.mockResolvedValueOnce([]); // UPDATE payments
    sql.mockResolvedValueOnce([]); // UPDATE orders → paid

    const res = await handleWebhook('mercadopago', {
      headers: { 'x-signature': 'ts=1,v1=ok' },
      body: { external_reference: '99', status: 'approved' },
    });

    expect(res).toMatchObject({ ok: true, status: 'approved' });
    const updPayments = sql.mock.calls[1];
    expect(updPayments[0].join(' ')).toContain('UPDATE payments');
    expect(updPayments).toEqual(expect.arrayContaining(['approved']));
    const updOrders = sql.mock.calls[2];
    expect(updOrders[0].join(' ')).toContain('UPDATE orders');
    expect(updOrders).toEqual(expect.arrayContaining(['paid']));
  });

  it('verified but UNKNOWN reference → acknowledged (200) with nothing changed', async () => {
    configureBinance();
    binance.verifyWebhook.mockReturnValue(true);
    binance.mapStatus.mockReturnValue('approved');
    sql.mockResolvedValueOnce([]); // findPayment → none

    const res = await handleWebhook('binance', {
      headers: {},
      rawBody: '{}',
      body: { merchantTradeNo: 'nope', bizStatus: 'PAY_SUCCESS' },
    });

    expect(res).toMatchObject({ ok: true, status: 'ignored' });
    expect(sql).toHaveBeenCalledTimes(1); // only the lookup, no UPDATE
  });

  it('not configured → throws (route turns it into 503)', async () => {
    await expect(
      handleWebhook('mercadopago', { headers: {}, body: {} }),
    ).rejects.toBeInstanceOf(PaymentsNotConfiguredError);
  });
});

describe('getStatus / refund / payout', () => {
  it('getStatus reconciles from the rail and persists the flip', async () => {
    configureMp();
    const payment = { id: 99, order_id: 10, rail: 'mercadopago', external_id: 'pref_1' };
    sql.mockResolvedValueOnce([ORDER]); // loadOrder
    sql.mockResolvedValueOnce([{ access_token: 'tok' }]); // loadProviderAccount
    mp.getPaymentStatus.mockResolvedValue({ status: 'approved', rawStatus: 'approved' });
    sql.mockResolvedValueOnce([]); // UPDATE payments
    sql.mockResolvedValueOnce([]); // UPDATE orders

    const res = await getStatus(payment);
    expect(res.status).toBe('approved');
    expect(mp.getPaymentStatus).toHaveBeenCalled();
  });

  it('refund calls the adapter then flips to refunded', async () => {
    configureMp();
    const payment = { id: 99, order_id: 10, rail: 'mercadopago', external_id: 'pref_1' };
    sql.mockResolvedValueOnce([ORDER]); // loadOrder
    sql.mockResolvedValueOnce([{ access_token: 'tok' }]); // loadProviderAccount
    mp.refund.mockResolvedValue({ status: 'refunded' });
    sql.mockResolvedValueOnce([]); // UPDATE payments
    sql.mockResolvedValueOnce([]); // UPDATE orders

    const res = await refund(payment);
    expect(res.status).toBe('refunded');
    expect(mp.refund).toHaveBeenCalled();
    expect(sql.mock.calls[3]).toEqual(expect.arrayContaining(['refunded']));
  });

  it('payout calls the rail Payout API and records a payouts row', async () => {
    configureBinance();
    const provider = { id: 5 };
    sql.mockResolvedValueOnce([{ account_ref: 'binid' }]); // loadProviderAccount
    binance.payout.mockResolvedValue({ status: 'paid', externalId: 'po_1' });
    sql.mockResolvedValueOnce([{ id: 1, provider_id: 5, amount_cents: 9000, status: 'paid' }]); // INSERT payouts

    const res = await payout(provider, 9000, { rail: 'binance' });
    expect(binance.payout).toHaveBeenCalledWith({
      provider,
      account: { account_ref: 'binid' },
      amountCents: 9000,
    });
    expect(res.payout).toMatchObject({ id: 1, status: 'paid' });
    expect(sql.mock.calls[1][0].join(' ')).toContain('INSERT INTO payouts');
  });

  it('payout not configured → throws', async () => {
    await expect(payout({ id: 5 }, 100, { rail: 'binance' })).rejects.toBeInstanceOf(
      PaymentsNotConfiguredError,
    );
  });
});
