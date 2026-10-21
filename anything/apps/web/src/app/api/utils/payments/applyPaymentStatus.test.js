import { describe, it, expect, vi, beforeEach } from 'vitest';

// applyPaymentStatus is a thin wrapper over the SECURITY DEFINER app_apply_payment_status (migration 0135).
// The F3-03 monotonic guard (refunded terminal; approved -> refunded only; repeats are no-ops) and the once-only
// stock / credit / booking side effects now live IN SQL, decided on a row-locked read — so they are proven on
// real Postgres in test/integration/payment-settlement.integration.test.ts. This file pins the wrapper contract:
// it makes exactly ONE database call (no second copy of the guard in JS, no direct writes to payments/orders)
// and reports what the database decided.

vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
import sql from '@/app/api/utils/sql';
import { applyPaymentStatus } from './index';

const pay = (status) => ({ id: 1, order_id: 9, rail: 'mercadopago', status });
const text = () => sql.mock.calls.map((c) => (c?.[0] ?? []).join(' ')).join(' | ');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('applyPaymentStatus → app_apply_payment_status', () => {
  it('makes exactly one call, to the DEFINER function, binding id / status / raw status', async () => {
    sql.mockResolvedValue([{ applied: true, out_order_id: 9, new_payment_status: 'approved', prev_order_status: 'pending', new_order_status: 'paid', confirmed_booking_ids: [] }]);
    const r = await applyPaymentStatus(pay('pending'), 'approved', 'approved');
    expect(sql).toHaveBeenCalledTimes(1);
    expect(text()).toContain('app_apply_payment_status');
    expect(sql.mock.calls[0].slice(1)).toEqual([1, 'approved', 'approved']);
    expect(r).toMatchObject({ applied: true, orderId: 9, newOrderStatus: 'paid', confirmedBookingIds: [] });
  });

  it('never writes payments / orders / stock directly from JS', async () => {
    sql.mockResolvedValue([{ applied: true }]);
    await applyPaymentStatus(pay('approved'), 'refunded', 'refunded');
    expect(text()).not.toMatch(/UPDATE (payments|orders)/i);
    expect(text()).not.toContain('app_adjust_order_stock');
    expect(text()).not.toContain('app_grant_walk_credits');
  });

  it('does not pre-filter on the (possibly stale) payment object — the database decides', async () => {
    // refunded -> approved would be ignored by the DB guard, but the decision is the DB's, on a locked read.
    sql.mockResolvedValue([{ applied: false, new_payment_status: 'refunded' }]);
    const r = await applyPaymentStatus(pay('refunded'), 'approved', 'approved');
    expect(sql).toHaveBeenCalledTimes(1);
    expect(r.applied).toBe(false);
  });

  it('passes a missing raw status as NULL', async () => {
    sql.mockResolvedValue([{ applied: true }]);
    await applyPaymentStatus(pay('pending'), 'failed', undefined);
    expect(sql.mock.calls[0].slice(1)).toEqual([1, 'failed', null]);
  });

  it('a payment that does not exist is { applied:false }, not a throw', async () => {
    sql.mockResolvedValue([]);
    await expect(applyPaymentStatus(pay('pending'), 'approved', 'approved')).resolves.toMatchObject({ applied: false });
  });
});
