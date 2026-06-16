import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET/POST /api/providers/[id]/payouts — provider-scoped settlements. GET = any active
// staff; POST = owner|admin via the layer payout(). Owners are never in scope.

import { GET, POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { resolveUserId } from '@/app/api/utils/currentUser';
import { requireProviderRole } from '@/app/api/utils/providerAuth';
import { payout } from '@/app/api/utils/payments';
import { PaymentsNotConfiguredError } from '@/app/api/utils/payments/config';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
vi.mock('@/app/api/utils/currentUser', () => ({ resolveUserId: vi.fn() }));
vi.mock('@/app/api/utils/providerAuth', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, requireProviderRole: vi.fn() };
});
vi.mock('@/app/api/utils/payments', () => ({ payout: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PARAMS = { params: { id: '5' } };
const postReq = (body) =>
  new Request('http://localhost/api/providers/5/payouts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
  requireProviderRole.mockResolvedValue({ role: 'admin', status: 'active' });
});

describe('GET /api/providers/[id]/payouts', () => {
  it('anonymous → 401', async () => {
    auth.mockResolvedValue(undefined);
    const res = await GET(new Request('http://localhost/x'), PARAMS);
    expect(res.status).toBe(401);
  });

  it('lists payouts for any active staff', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 1, amount_cents: 9000, status: 'paid' }]);
    const res = await GET(new Request('http://localhost/x'), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).payouts).toHaveLength(1);
    expect(sql.mock.calls[0][0].join(' ')).toContain('FROM payouts');
  });
});

describe('POST /api/providers/[id]/payouts', () => {
  it('403 when not owner|admin', async () => {
    auth.mockResolvedValue(SESSION);
    requireProviderRole.mockRejectedValueOnce(
      Object.assign(new Error('Not authorized'), { status: 403 }),
    );
    const res = await POST(postReq({ amount_cents: 9000, rail: 'binance' }), PARAMS);
    expect(res.status).toBe(403);
  });

  it('invalid amount → 400', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(postReq({ amount_cents: 0, rail: 'binance' }), PARAMS);
    expect(res.status).toBe(400);
  });

  it('invalid rail → 400', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(postReq({ amount_cents: 9000, rail: 'wire' }), PARAMS);
    expect(res.status).toBe(400);
  });

  it('admin payout → 201 records the row', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 5, name: 'Clinic' }]); // load provider
    payout.mockResolvedValue({ payout: { id: 1, status: 'paid', amount_cents: 9000 } });
    const res = await POST(postReq({ amount_cents: 9000, rail: 'binance' }), PARAMS);
    expect(res.status).toBe(201);
    expect((await res.json()).payout).toMatchObject({ id: 1, status: 'paid' });
    expect(payout).toHaveBeenCalledWith({ id: 5, name: 'Clinic' }, 9000, { rail: 'binance' });
  });

  it('not configured → 503', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ id: 5 }]);
    payout.mockRejectedValue(new PaymentsNotConfiguredError('binance'));
    const res = await POST(postReq({ amount_cents: 9000, rail: 'binance' }), PARAMS);
    expect(res.status).toBe(503);
  });
});
