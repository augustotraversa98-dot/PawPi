import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/payments/checkout — auth, sql, resolveUserId, the payment layer, and provider-notify
// are mocked at the module boundary.
//
// B1 (night-run #1) — FAIL-CLOSED server-side pricing: the client's amount_cents is NEVER charged
// as-is except for a bounded donation. `product` is priced from the catalog / rx-fulfillment row.
// BOOKINGS-PRICING (2026-08-21) wires the priceable kinds to a server price source: booking →
// provider_services policy OR transport_trips fare; adoption_fee → adoptable_listings fee. A tampered
// amount_cents can never change the charge (regression tests below); a priceable entity with no amount
// returns `no_payment_required` (book/apply free instead), and a kind with no price reference still
// fails closed with `pricing_not_configured`. `subscription` is LEAD-GEN ONLY for v1 (insurance has no
// in-app premium payment) — it is always rejected with `not_available`.

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

  // ---- booking: priced from the service's payment_policy ----
  it('booking (full policy): charges the SERVER price_cents, ignoring a tampered amount_cents', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([
        { payment_policy: 'full', price_cents: 8000, deposit_cents: 2000 },
      ]) // provider_services lookup
      .mockResolvedValueOnce([{ id: 30, amount_cents: 8000 }]); // INSERT orders
    createCheckout.mockResolvedValue({ payment: { id: 1 }, checkoutUrl: 'u' });

    const res = await POST(
      jsonReq({
        provider_id: 5,
        kind: 'booking',
        rail: 'mercadopago',
        amount_cents: 1, // tampered — must be ignored
        service_id: 9,
      }),
    );

    expect(res.status).toBe(201);
    // The service lookup is scoped to the service id + provider.
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([9, 5]));
    const orderInsert = sql.mock.calls[1];
    expect(orderInsert[0].join(' ')).toContain('INSERT INTO orders');
    expect(orderInsert).toEqual(expect.arrayContaining([8000])); // server price, not 1
    expect(orderInsert).not.toContain(1);
  });

  it('booking (deposit policy): charges deposit_cents, not price_cents', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([
        { payment_policy: 'deposit', price_cents: 8000, deposit_cents: 2000 },
      ])
      .mockResolvedValueOnce([{ id: 31, amount_cents: 2000 }]);
    createCheckout.mockResolvedValue({ payment: { id: 1 }, checkoutUrl: 'u' });

    const res = await POST(
      jsonReq({ provider_id: 5, kind: 'booking', rail: 'mercadopago', amount_cents: 999999, service_id: 9 }),
    );
    expect(res.status).toBe(201);
    expect(sql.mock.calls[1]).toEqual(expect.arrayContaining([2000]));
    expect(sql.mock.calls[1]).not.toContain(8000);
  });

  it("booking ('none' policy): 400 no_payment_required, no order (book it free instead)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([
      { payment_policy: 'none', price_cents: 8000, deposit_cents: 2000 },
    ]);
    const res = await POST(
      jsonReq({ provider_id: 5, kind: 'booking', rail: 'mercadopago', amount_cents: 8000, service_id: 9 }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('no_payment_required');
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it('booking: an inactive / foreign service → 404 unpriceable_booking', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // provider_services lookup → none
    const res = await POST(
      jsonReq({ provider_id: 5, kind: 'booking', rail: 'mercadopago', amount_cents: 1, service_id: 999 }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('unpriceable_booking');
    expect(createCheckout).not.toHaveBeenCalled();
  });

  // ---- booking: transport fare path (source_ref "transport:<id>") ----
  it('booking/transport: prices from the owner transport_trips fare, ignoring the client amount', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ fare_amount: 45.5 }]) // transport_trips lookup (dollars)
      .mockResolvedValueOnce([{ id: 32, amount_cents: 4550 }]); // INSERT orders
    createCheckout.mockResolvedValue({ payment: { id: 1 }, checkoutUrl: 'u' });

    const res = await POST(
      jsonReq({
        provider_id: 5,
        kind: 'booking',
        rail: 'mercadopago',
        amount_cents: 1, // tampered
        source_ref: 'transport:77',
      }),
    );
    expect(res.status).toBe(201);
    // Scoped to the parsed trip id + caller + provider.
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([77, 7, 5]));
    expect(sql.mock.calls[1]).toEqual(expect.arrayContaining([4550])); // 45.50 → cents
    expect(sql.mock.calls[1]).not.toContain(1);
  });

  it('booking: no service and no fare reference → 400 pricing_not_configured', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(
      jsonReq({ provider_id: 5, kind: 'booking', rail: 'mercadopago', amount_cents: 10000 }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('pricing_not_configured');
    expect(sql).not.toHaveBeenCalled();
  });

  // ---- adoption_fee: priced from the listing ----
  it('adoption_fee: charges the SERVER listing fee, ignoring a tampered amount_cents', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([{ adoption_fee_cents: 12000 }]) // adoptable_listings lookup
      .mockResolvedValueOnce([{ id: 40, amount_cents: 12000 }]); // INSERT orders
    createCheckout.mockResolvedValue({ payment: { id: 1 }, checkoutUrl: 'u' });

    const res = await POST(
      jsonReq({
        provider_id: 5,
        kind: 'adoption_fee',
        rail: 'mercadopago',
        amount_cents: 1, // tampered
        source_ref: 'adoption-listing-9',
      }),
    );
    expect(res.status).toBe(201);
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining([9, 5]));
    expect(sql.mock.calls[1]).toEqual(expect.arrayContaining([12000]));
    expect(sql.mock.calls[1]).not.toContain(1);
  });

  it('adoption_fee: a listing with no fee → 400 no_payment_required, no order', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ adoption_fee_cents: 0 }]);
    const res = await POST(
      jsonReq({ provider_id: 5, kind: 'adoption_fee', rail: 'mercadopago', amount_cents: 5000, source_ref: 'adoption-listing-9' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('no_payment_required');
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it('adoption_fee: unknown listing → 404 unpriceable_adoption', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    const res = await POST(
      jsonReq({ provider_id: 5, kind: 'adoption_fee', rail: 'mercadopago', amount_cents: 1, source_ref: 'adoption-listing-999' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('unpriceable_adoption');
  });

  it('adoption_fee: no listing reference → 400 pricing_not_configured', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(
      jsonReq({ provider_id: 5, kind: 'adoption_fee', rail: 'mercadopago', amount_cents: 10000 }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('pricing_not_configured');
    expect(sql).not.toHaveBeenCalled();
  });

  // ---- subscription: LEAD-GEN ONLY (v1) — insurance has no in-app premium payment ----
  it('subscription: always rejected with not_available, no order (even with a valid ins ref)', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(
      jsonReq({
        provider_id: 5,
        kind: 'subscription',
        rail: 'mercadopago',
        amount_cents: 30000,
        source_ref: 'ins-3',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('not_available');
    expect(sql).not.toHaveBeenCalled();
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it('subscription: rejected even with no reference (no in-app charge path exists)', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(
      jsonReq({ provider_id: 5, kind: 'subscription', rail: 'mercadopago', amount_cents: 10000 }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('not_available');
    expect(sql).not.toHaveBeenCalled();
    expect(createCheckout).not.toHaveBeenCalled();
  });

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
