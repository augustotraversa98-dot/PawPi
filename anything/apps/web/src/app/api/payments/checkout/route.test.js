import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/payments/checkout — auth, sql, resolveUserId, the payment layer, and provider-notify
// are mocked at the module boundary.
//
// B1 (night-run #1) — FAIL-CLOSED server-side pricing: the client's amount_cents is NEVER charged
// as-is except for a bounded donation. `product` is priced from the catalog / rx-fulfillment row;
// booking / adoption_fee / subscription have no server price source yet and are rejected. These
// tests pin that contract (they REPLACE the old ones that asserted the trust-the-client behavior).

import { POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { resolveUserId } from '@/app/api/utils/currentUser';
import { createCheckout } from '@/app/api/utils/payments';
import {
  PaymentsNotConfiguredError,
  ProviderPaymentAccountError,
} from '@/app/api/utils/payments/config';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
vi.mock('@/app/api/utils/currentUser', () => ({ resolveUserId: vi.fn() }));
vi.mock('@/app/api/utils/payments', () => ({ createCheckout: vi.fn() }));
// Provider notification does its own DB work; mock it so it can't shift the sql call sequence the
// pricing assertions rely on.
vi.mock('@/app/api/utils/providerNotify', () => ({ notifyProviderTeam: vi.fn() }));

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

// A DONATION reaches order-creation + the payment layer (it's the one kind that legitimately uses a
// client amount), so it's the baseline for the plumbing/error-path tests.
const DONATION = {
  provider_id: 5,
  kind: 'donation',
  amount_cents: 10000,
  rail: 'mercadopago',
};

describe('POST /api/payments/checkout — plumbing', () => {
  it('anonymous → 401, no DB', async () => {
    auth.mockResolvedValue(undefined);
    const res = await POST(jsonReq(DONATION));
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('invalid kind → 400', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(jsonReq({ ...DONATION, kind: 'bribe' }));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it('invalid rail → 400 (no single-rail assumption)', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(jsonReq({ ...DONATION, rail: 'paypal' }));
    expect(res.status).toBe(400);
  });

  it('creates the order then the layer checkout; returns 201', async () => {
    auth.mockResolvedValue(SESSION);
    const order = { id: 10, owner_user_id: 7, provider_id: 5, amount_cents: 10000 };
    sql.mockResolvedValueOnce([order]); // INSERT orders RETURNING *
    createCheckout.mockResolvedValue({
      payment: { id: 99, status: 'pending' },
      checkoutUrl: 'https://mp/checkout',
    });

    const res = await POST(jsonReq(DONATION));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.order).toEqual(order);
    expect(data.checkoutUrl).toBe('https://mp/checkout');
    expect(sql.mock.calls[0][0].join(' ')).toContain('INSERT INTO orders');
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([7, 5, 'donation', 10000]));
    expect(createCheckout).toHaveBeenCalledWith(
      order,
      expect.objectContaining({ rail: 'mercadopago', idempotencyKey: 'order-10' }),
    );
  });

  it('payments-not-configured → 503', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 10, amount_cents: 10000 }]);
    createCheckout.mockRejectedValue(new PaymentsNotConfiguredError('mercadopago'));
    const res = await POST(jsonReq(DONATION));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/not configured/i);
  });

  it('provider-not-connected → 409 with code (NOT the platform 503)', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 10, amount_cents: 10000 }]);
    createCheckout.mockRejectedValue(
      new ProviderPaymentAccountError('mercadopago', 'not_connected'),
    );
    const res = await POST(jsonReq(DONATION));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('account_not_connected');
  });
});

describe('B1 fail-closed pricing', () => {
  // ---- product: shop-catalog path ----
  it('product: charges the SERVER catalog total, ignoring a tampered amount_cents', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([
        { id: 1, name: 'Kibble', price_cents: 2500, active: true, provider_id: 5 },
      ]) // shop_products lookup
      .mockResolvedValueOnce([{ id: 10, provider_id: 5, amount_cents: 5000 }]) // INSERT orders
      .mockResolvedValueOnce([]); // INSERT order_items
    createCheckout.mockResolvedValue({ payment: { id: 1 }, checkoutUrl: 'u' });

    const res = await POST(
      jsonReq({
        provider_id: 5,
        kind: 'product',
        rail: 'mercadopago',
        amount_cents: 1, // tampered — must be ignored
        items: [{ name: 'Kibble', quantity: 2, product_id: 1 }],
      }),
    );

    expect(res.status).toBe(201);
    // The order was created at the server total (2 × 2500), NOT the tampered 1 cent.
    const orderInsert = sql.mock.calls[1];
    expect(orderInsert[0].join(' ')).toContain('INSERT INTO orders');
    expect(orderInsert).toEqual(expect.arrayContaining([5000]));
    expect(orderInsert).not.toContain(1);
    // The line item is priced from the catalog and tied by product_id (not product_ref).
    const itemInsert = sql.mock.calls[2];
    expect(itemInsert[0].join(' ')).toContain('INSERT INTO order_items');
    expect(itemInsert[0].join(' ')).toContain('product_id');
    expect(itemInsert).toEqual(expect.arrayContaining([2500, 1])); // unit_cents from catalog, product_id
  });

  it('product: rejects an item that does not resolve to a real active product', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // shop_products lookup → none
    const res = await POST(
      jsonReq({
        provider_id: 5,
        kind: 'product',
        rail: 'mercadopago',
        amount_cents: 1,
        items: [{ name: 'Ghost', quantity: 1, product_id: 999 }],
      }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('unpriceable_item');
    expect(createCheckout).not.toHaveBeenCalled();
  });

  // ---- product: rx-fulfillment path ----
  it('product/rxf: prices from the owner rx_fulfillment_orders row, ignoring the client amount', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ price_cents: 3200 }]) // rx_fulfillment_orders lookup
      .mockResolvedValueOnce([{ id: 12, amount_cents: 3200 }]); // INSERT orders
    createCheckout.mockResolvedValue({ payment: { id: 1 }, checkoutUrl: 'u' });

    const res = await POST(
      jsonReq({
        provider_id: 5,
        kind: 'product',
        rail: 'mercadopago',
        amount_cents: 1, // tampered
        source_ref: 'rxf-77',
      }),
    );

    expect(res.status).toBe(201);
    const orderInsert = sql.mock.calls[1];
    expect(orderInsert).toEqual(expect.arrayContaining([3200]));
    expect(orderInsert).not.toContain(1);
    // The lookup was scoped to the caller (owner_user_id) and the parsed id.
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([77, 7]));
  });

  it('product with no items and no priced reference → 400 pricing_not_configured', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(
      jsonReq({ provider_id: 5, kind: 'product', rail: 'mercadopago', amount_cents: 9999 }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('pricing_not_configured');
    expect(sql).not.toHaveBeenCalled();
  });

  // ---- kinds with no server price source → fail closed ----
  it.each(['booking', 'adoption_fee', 'subscription'])(
    "%s → 400 pricing_not_configured, no order created",
    async (kind) => {
      auth.mockResolvedValue(SESSION);
      const res = await POST(
        jsonReq({ provider_id: 5, kind, rail: 'mercadopago', amount_cents: 10000 }),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('pricing_not_configured');
      expect(sql).not.toHaveBeenCalled();
      expect(createCheckout).not.toHaveBeenCalled();
    },
  );

  // ---- donation bounds ----
  it('donation: a valid amount is charged as-is', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 20, amount_cents: 2500 }]);
    createCheckout.mockResolvedValue({ payment: { id: 1 }, checkoutUrl: 'u' });
    const res = await POST(jsonReq({ ...DONATION, amount_cents: 2500 }));
    expect(res.status).toBe(201);
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([2500]));
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['non-integer', 12.5],
    ['over the cap', 5_000_001],
  ])('donation: %s amount → 400, no order', async (_label, amount_cents) => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(jsonReq({ ...DONATION, amount_cents }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('invalid_amount');
    expect(sql).not.toHaveBeenCalled();
  });
});
