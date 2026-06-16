import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET .../mercadopago/connect — owner|admin gets the OAuth authorization URL. buildOAuthUrl
// is mocked; proves auth gating, the 503 not-configured path, and that state binds to the
// provider.

import { GET } from './route';
import { auth } from '@/auth';
import { resolveUserId } from '@/app/api/utils/currentUser';
import { requireProviderRole } from '@/app/api/utils/providerAuth';
import { buildOAuthUrl } from '@/app/api/utils/payments/mercadopago';
import { PaymentsNotConfiguredError } from '@/app/api/utils/payments/config';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/currentUser', () => ({ resolveUserId: vi.fn() }));
vi.mock('@/app/api/utils/providerAuth', () => ({ requireProviderRole: vi.fn() }));
vi.mock('@/app/api/utils/payments/mercadopago', () => ({ buildOAuthUrl: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PARAMS = { params: { id: '5' } };
const req = () => new Request('http://localhost/x');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
  requireProviderRole.mockResolvedValue({ role: 'owner', status: 'active' });
});

describe('GET .../mercadopago/connect', () => {
  it('anonymous → 401', async () => {
    auth.mockResolvedValue(undefined);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(401);
  });

  it('403 when not owner|admin', async () => {
    auth.mockResolvedValue(SESSION);
    requireProviderRole.mockRejectedValueOnce(
      Object.assign(new Error('nope'), { status: 403 }),
    );
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(403);
  });

  it('returns the authorization URL + a provider-bound state', async () => {
    auth.mockResolvedValue(SESSION);
    buildOAuthUrl.mockReturnValue('https://auth.mercadopago.com/authorization?x=1');
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.authUrl).toContain('auth.mercadopago.com');
    expect(data.state.startsWith('5.')).toBe(true); // binds to provider 5
    expect(buildOAuthUrl).toHaveBeenCalledWith({ state: data.state });
  });

  it('not configured → 503', async () => {
    auth.mockResolvedValue(SESSION);
    buildOAuthUrl.mockImplementation(() => {
      throw new PaymentsNotConfiguredError('mercadopago');
    });
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(503);
  });
});
