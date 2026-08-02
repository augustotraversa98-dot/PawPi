import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET .../payment-accounts — owner|admin reads the connection STATUS of each rail.
// Never returns tokens; just enough for the dashboard to show connected/not.

import { GET } from './route';
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
const req = () => new Request('http://localhost/x');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
  requireProviderRole.mockResolvedValue({ role: 'owner', status: 'active' });
});

describe('GET .../payment-accounts', () => {
  it('anonymous → 401', async () => {
    auth.mockResolvedValue(undefined);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(401);
  });

  it('no profile → 404', async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValueOnce(null);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(404);
  });

  it('403 when not owner|admin', async () => {
    auth.mockResolvedValue(SESSION);
    requireProviderRole.mockRejectedValueOnce(
      Object.assign(new Error('nope'), { status: 403 }),
    );
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(403);
  });

  it('maps rows by rail with connected flag, and NEVER returns tokens', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([
      {
        rail: 'mercadopago',
        account_ref: 'MP-USER-1',
        status: 'connected',
        updated_at: '2026-01-01',
      },
      {
        rail: 'binance',
        account_ref: 'bnc-1',
        status: 'pending',
        updated_at: '2026-01-02',
      },
    ]);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accounts.mercadopago).toEqual({
      connected: true,
      account_ref: 'MP-USER-1',
      status: 'connected',
      updated_at: '2026-01-01',
    });
    expect(body.accounts.binance.connected).toBe(false);
    // Secrets must never leak through this endpoint.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('access_token');
    expect(raw).not.toContain('refresh_token');
    // Only selects the four safe columns.
    expect(sql.mock.calls[0][0].join(' ')).toContain('SELECT rail, account_ref, status, updated_at');
  });

  it('no linked rails → empty map', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accounts: {} });
  });
});
