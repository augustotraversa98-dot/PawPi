import { describe, it, expect, vi, beforeEach } from 'vitest';

// Flow audit F3-03: payment status can only move forward. Late / duplicate / out-of-order rail
// events must not re-pay a refunded order or flip a paid one back to pending/failed.

vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
import sql from '@/app/api/utils/sql';
import { applyPaymentStatus } from './index';

const pay = (status) => ({ id: 1, order_id: 9, rail: 'mercadopago', status });
const writes = () => sql.mock.calls.map((c) => (c?.[0] ?? []).join(' ')).filter((t) => /UPDATE (payments|orders)/.test(t));

beforeEach(() => {
  vi.clearAllMocks();
  sql.mockResolvedValue([{ kind: 'booking', status: 'pending' }]);
});

describe('applyPaymentStatus is monotonic', () => {
  it.each([
    ['refunded', 'approved'],
    ['refunded', 'pending'],
    ['refunded', 'failed'],
    ['approved', 'pending'],
    ['approved', 'failed'],
  ])('%s → %s is ignored (no writes)', async (from, to) => {
    await applyPaymentStatus(pay(from), to, to);
    expect(writes()).toHaveLength(0);
  });

  it.each([
    ['pending', 'approved'],
    ['pending', 'failed'],
    ['approved', 'refunded'],
    ['approved', 'approved'], // idempotent redelivery
    ['refunded', 'refunded'],
  ])('%s → %s is applied', async (from, to) => {
    await applyPaymentStatus(pay(from), to, to);
    expect(writes().length).toBeGreaterThan(0);
  });
});
