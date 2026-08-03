import { describe, it, expect, vi, beforeEach } from 'vitest';

// DELETE .../payment-accounts/mercadopago — owner|admin disconnects the rail so a bad/
// undecryptable token can be replaced by reconnecting. Proves auth gating and that the
// UPDATE clears the tokens + flips status to 'disconnected', scoped to this provider+rail.

import { DELETE } from './route';
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
const req = () => new Request('http://localhost/x', { method: 'DELETE' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
  requireProviderRole.mockResolvedValue({ role: 'owner', status: 'active' });
  sql.mockResolvedValue([]);
});

describe('DELETE .../payment-accounts/mercadopago', () => {
  it('anonymous → 401, no DB write', async () => {
    auth.mockResolvedValue(undefined);
    const res = await DELETE(req(), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('403 when not owner|admin', async () => {
    auth.mockResolvedValue(SESSION);
    requireProviderRole.mockRejectedValueOnce(
      Object.assign(new Error('nope'), { status: 403 }),
    );
    const res = await DELETE(req(), PARAMS);
    expect(res.status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });

  it('owner disconnects → 200, clears tokens + status=disconnected, scoped to provider+rail', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await DELETE(req(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ disconnected: true, rail: 'mercadopago' });

    const call = sql.mock.calls.at(-1);
    const text = call[0].join(' ');
    expect(text).toContain('UPDATE provider_payment_accounts');
    expect(text).toContain('access_token = NULL');
    expect(text).toContain('refresh_token = NULL');
    // Bound to THIS provider and the mercadopago rail, and sets the disconnected status.
    expect(call).toEqual(expect.arrayContaining(['5']));
    expect(text).toContain("'disconnected'");
    expect(text).toContain("'mercadopago'");
  });
});
