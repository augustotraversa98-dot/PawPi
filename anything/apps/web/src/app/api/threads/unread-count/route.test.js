import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/threads/unread-count — the caller's unread badge (ticket 2.5). RLS scopes
// the counted messages to threads the caller can see; here we pin the auth gate, the
// default/owner/provider scoping branches, and the count return shape.

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
vi.mock('@/app/api/utils/providerAuth', () => {
  class ProviderAuthError extends Error {
    constructor(m) { super(m); this.status = 403; }
  }
  return {
    requireProviderRole: vi.fn(),
    ProviderAuthError,
    ALL_PROVIDER_ROLES: ['owner', 'admin', 'staff', 'vet'],
  };
});

import { requireProviderRole } from '@/app/api/utils/providerAuth';

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };

const req = (query = '') =>
  new Request(`http://localhost/api/threads/unread-count${query}`);

const lastCall = () => sql.mock.calls[sql.mock.calls.length - 1];
const lastQueryText = () => (lastCall()?.[0] ?? []).join(' ');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/threads/unread-count', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('default: counts across all the caller\'s visible threads', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ unread_count: 4 }]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ unread_count: 4 });
    const text = lastQueryText();
    expect(text).toContain('FROM messages');
    expect(text).toContain('read_at IS NULL');
  });

  it('owner side: filters to my own threads', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ unread_count: 1 }]);
    await GET(req('?side=owner'));
    expect(lastQueryText()).toContain('t.owner_user_id =');
  });

  it('provider side: filters to the named provider\'s threads', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ unread_count: 3 }]);
    const res = await GET(req('?side=provider&providerId=10'));
    expect(await res.json()).toEqual({ unread_count: 3 });
    expect(lastQueryText()).toContain('t.provider_id =');
    // AUDIT A-22: the provider badge is gated on active staff membership.
    expect(requireProviderRole).toHaveBeenCalledWith(
      '10',
      7,
      expect.any(Array),
    );
  });

  it('provider side: a non-staff caller → 403 (AUDIT A-22)', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const { ProviderAuthError } = await import('@/app/api/utils/providerAuth');
    requireProviderRole.mockRejectedValueOnce(new ProviderAuthError('not staff'));
    const res = await GET(req('?side=provider&providerId=10'));
    expect(res.status).toBe(403);
  });
});
