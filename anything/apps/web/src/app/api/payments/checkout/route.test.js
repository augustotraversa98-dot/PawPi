import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// POST /api/payments/checkout — auth, sql, resolveUserId, and the payment layer are
// mocked at the module boundary. Proves: anon→401, validation 400s, owner creates an
// order + the layer creates the checkout, and the "not configured" 503 path.

import { POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { resolveUserId } from '@/app/api/utils/currentUser';
import { createCheckout } from '@/app/api/utils/payments';
import { PaymentsNotConfiguredError } from '@/app/api/utils/payments/config';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
vi.mock('@/app/api/utils/currentUser', () => ({ resolveUserId: vi.fn() }));
vi.mock('@/app/api/utils/payments', () => ({ createCheckout: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const jsonReq = (body) =>
  new Request('http://localhost/api/payments/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

const VALID = {
  provider_id: 5,
  kind: 'booking',
  amount_cents: 10000,
  rail: 'mercadopago',
};

describe('POST /api/payments/checkout', () => {
  it('anonymous → 401, no DB', async () => {
    auth.mockResolvedValue(undefined);
    const res = await POST(jsonReq(VALID));
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('invalid kind → 400', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(jsonReq({ ...VALID, kind: 'bribe' }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it('invalid rail → 400 (no single-rail assumption)', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(jsonReq({ ...VALID, rail: 'paypal' }));
    expect(res.status).toBe(400);
  });

  it('negative amount → 400', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(jsonReq({ ...VALID, amount_cents: -1 }));
    expect(res.status).toBe(400);
  });

  it('creates an order then the layer checkout; returns 201 with the checkout url', async () => {
    auth.mockResolvedValue(SESSION);
    const order = { id: 10, owner_user_id: 7, provider_id: 5, amount_cents: 10000 };
    sql.mockResolvedValueOnce([order]); // INSERT orders RETURNING *
    createCheckout.mockResolvedValue({
      payment: { id: 99, status: 'pending' },
      checkoutUrl: 'https://mp/checkout',
    });

    const res = await POST(jsonReq(VALID));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.order).toEqual(order);
    expect(data.checkoutUrl).toBe('https://mp/checkout');
    // The order was created owner-scoped (userId bound).
    expect(sql.mock.calls[0][0].join(' ')).toContain('INSERT INTO orders');
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([7, 5, 'booking', 10000]));
    // The layer was invoked with the persisted order + an idempotency key.
    expect(createCheckout).toHaveBeenCalledWith(
      order,
      expect.objectContaining({ rail: 'mercadopago', idempotencyKey: 'order-10' }),
    );
  });

  it('persists order_items when provided', async () => {
    auth.mockResolvedValue(SESSION);
    const order = { id: 11, owner_user_id: 7, provider_id: 5, amount_cents: 5000 };
    sql.mockResolvedValueOnce([order]); // INSERT orders
    sql.mockResolvedValueOnce([]); // INSERT order_items #1
    createCheckout.mockResolvedValue({ payment: { id: 1 }, checkoutUrl: 'u' });

    const res = await POST(
      jsonReq({
        ...VALID,
        amount_cents: 5000,
        kind: 'product',
        items: [{ name: 'Kibble', quantity: 2, unit_cents: 2500, product_ref: 'sku1' }],
      }),
    );

    expect(res.status).toBe(201);
    expect(sql.mock.calls[1][0].join(' ')).toContain('INSERT INTO order_items');
    expect(sql.mock.calls[1]).toEqual(expect.arrayContaining(['Kibble', 2, 2500, 'sku1']));
  });

  it('payments-not-configured → 503', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 10, amount_cents: 10000 }]);
    createCheckout.mockRejectedValue(new PaymentsNotConfiguredError('mercadopago'));

    const res = await POST(jsonReq(VALID));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/not configured/i);
  });
});
