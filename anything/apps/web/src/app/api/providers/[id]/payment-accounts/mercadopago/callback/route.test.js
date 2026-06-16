import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST .../mercadopago/callback — owner|admin exchanges the OAuth code and we UPSERT the
// token. CRITICAL: the response NEVER contains the token. exchangeOAuthCode + sql mocked.

import { POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { resolveUserId } from '@/app/api/utils/currentUser';
import { requireProviderRole } from '@/app/api/utils/providerAuth';
import { exchangeOAuthCode } from '@/app/api/utils/payments/mercadopago';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({
  default: Object.assign(vi.fn(), { json: vi.fn((v) => v) }),
}));
vi.mock('@/app/api/utils/currentUser', () => ({ resolveUserId: vi.fn() }));
vi.mock('@/app/api/utils/providerAuth', () => ({ requireProviderRole: vi.fn() }));
vi.mock('@/app/api/utils/payments/mercadopago', () => ({ exchangeOAuthCode: vi.fn() }));

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

describe('POST .../mercadopago/callback', () => {
  it('anonymous → 401', async () => {
    auth.mockResolvedValue(undefined);
    const res = await POST(req({ code: 'c', state: '5.x' }), PARAMS);
    expect(res.status).toBe(401);
  });

  it('missing code → 400', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(req({ state: '5.x' }), PARAMS);
    expect(res.status).toBe(400);
  });

  it('state for a DIFFERENT provider → 400 (CSRF/binding)', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(req({ code: 'c', state: '999.x' }), PARAMS);
    expect(res.status).toBe(400);
    expect(exchangeOAuthCode).not.toHaveBeenCalled();
  });

  it('exchanges the code, UPSERTs the token, and NEVER returns it', async () => {
    auth.mockResolvedValue(SESSION);
    exchangeOAuthCode.mockResolvedValue({
      accessToken: 'SECRET_TOKEN',
      refreshToken: 'SECRET_REFRESH',
      accountRef: '123',
      meta: { scope: 'read write' },
    });
    sql.mockResolvedValueOnce([]); // UPSERT

    const res = await POST(req({ code: 'c', state: '5.nonce' }), PARAMS);

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toEqual({ connected: true, rail: 'mercadopago', account_ref: '123' });
    // The token never leaves the server.
    expect(JSON.stringify(data)).not.toContain('SECRET_TOKEN');
    expect(JSON.stringify(data)).not.toContain('SECRET_REFRESH');
    // The UPSERT bound the access token.
    expect(sql.mock.calls[0][0].join(' ')).toContain('INSERT INTO provider_payment_accounts');
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(['SECRET_TOKEN']));
  });
});
