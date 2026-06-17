import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// POST .../mercadopago/callback — owner|admin exchanges the OAuth code and we UPSERT the
// token. CRITICAL: the response NEVER contains the token. exchangeOAuthCode + sql mocked.

import { POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { resolveUserId } from '@/app/api/utils/currentUser';
import { requireProviderRole } from '@/app/api/utils/providerAuth';
import { exchangeOAuthCode } from '@/app/api/utils/payments/mercadopago';
import { decryptToken } from '@/app/api/utils/payments/tokenCrypto';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({
  default: Object.assign(vi.fn(), { json: vi.fn((v) => v) }),
}));
vi.mock('@/app/api/utils/currentUser', () => ({ resolveUserId: vi.fn() }));
vi.mock('@/app/api/utils/providerAuth', () => ({ requireProviderRole: vi.fn() }));
vi.mock('@/app/api/utils/payments/mercadopago', () => ({ exchangeOAuthCode: vi.fn() }));
// tokenCrypto is NOT mocked — we exercise the real AES-256-GCM encrypt with a test key.

const TEST_KEY = '0'.repeat(64); // 32 zero bytes, hex (test only)
const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PARAMS = { params: { id: '5' } };
const req = (body) =>
  new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

let savedKey;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
  requireProviderRole.mockResolvedValue({ role: 'owner', status: 'active' });
  savedKey = process.env.PAYMENTS_TOKEN_KEY;
  process.env.PAYMENTS_TOKEN_KEY = TEST_KEY;
});
afterEach(() => {
  if (savedKey === undefined) delete process.env.PAYMENTS_TOKEN_KEY;
  else process.env.PAYMENTS_TOKEN_KEY = savedKey;
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

  it('exchanges the code, UPSERTs an ENCRYPTED token, and NEVER returns it', async () => {
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

    // The UPSERT bound CIPHERTEXT, never the plaintext secret (ticket 2.16).
    const bound = sql.mock.calls[0];
    expect(bound[0].join(' ')).toContain('INSERT INTO provider_payment_accounts');
    const enc = bound.filter((v) => typeof v === 'string' && v.startsWith('enc:v1:'));
    // Both the access AND refresh token are encrypted.
    expect(enc).toHaveLength(2);
    // No plaintext secret is ever persisted.
    expect(bound).not.toContain('SECRET_TOKEN');
    expect(bound).not.toContain('SECRET_REFRESH');
    // …and the ciphertext decrypts back to the originals (round-trip on the bound values).
    const decrypted = enc.map((v) => decryptToken(v));
    expect(decrypted).toEqual(
      expect.arrayContaining(['SECRET_TOKEN', 'SECRET_REFRESH']),
    );
  });

  it('missing PAYMENTS_TOKEN_KEY → 503 (refuses to store a token in plaintext, no write)', async () => {
    delete process.env.PAYMENTS_TOKEN_KEY;
    auth.mockResolvedValue(SESSION);
    exchangeOAuthCode.mockResolvedValue({
      accessToken: 'SECRET_TOKEN',
      refreshToken: 'SECRET_REFRESH',
      accountRef: '123',
      meta: {},
    });

    const res = await POST(req({ code: 'c', state: '5.nonce' }), PARAMS);

    expect(res.status).toBe(503);
    // Encryption threw before any INSERT — nothing persisted.
    expect(sql).not.toHaveBeenCalled();
  });
});
