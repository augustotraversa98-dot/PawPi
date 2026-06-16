import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST .../binance — owner|admin captures the provider's Binance Pay handle. No token; we
// just UPSERT the public account_ref.

import { POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { resolveUserId } from '@/app/api/utils/currentUser';
import { requireProviderRole } from '@/app/api/utils/providerAuth';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
vi.mock('@/app/api/utils/currentUser', () => ({ resolveUserId: vi.fn() }));
vi.mock('@/app/api/utils/providerAuth', () => ({ requireProviderRole: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PARAMS = { params: { id: '5' } };
const req = (body) =>
  new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
  requireProviderRole.mockResolvedValue({ role: 'owner', status: 'active' });
});

describe('POST .../binance', () => {
  it('anonymous → 401', async () => {
    auth.mockResolvedValue(undefined);
    const res = await POST(req({ binance_id: 'b1' }), PARAMS);
    expect(res.status).toBe(401);
  });

  it('403 when not owner|admin', async () => {
    auth.mockResolvedValue(SESSION);
    requireProviderRole.mockRejectedValueOnce(
      Object.assign(new Error('nope'), { status: 403 }),
    );
    const res = await POST(req({ binance_id: 'b1' }), PARAMS);
    expect(res.status).toBe(403);
  });

  it('missing binance_id → 400', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(req({}), PARAMS);
    expect(res.status).toBe(400);
  });

  it('captures the handle → 201', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    const res = await POST(req({ binance_id: 'binance-123' }), PARAMS);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      connected: true,
      rail: 'binance',
      account_ref: 'binance-123',
    });
    expect(sql.mock.calls[0][0].join(' ')).toContain('INSERT INTO provider_payment_accounts');
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(['binance-123']));
  });
});
