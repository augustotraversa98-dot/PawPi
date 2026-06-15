import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/provider-invites — the caller's own PENDING provider invitations.
// auth() and `sql` are mocked at the module boundary. This route is self-scoped
// (NOT requireProviderRole): authorization lives in the WHERE user_profile_id = me
// clause, so the test proves the query binds the resolved profile id and filters
// to status='invited' — it can never leak another user's invites.

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };

const queryTextOf = (callIndex) =>
  (sql.mock.calls[callIndex]?.[0] ?? []).join(' ');
const valuesOf = (callIndex) => sql.mock.calls[callIndex]?.slice(1) ?? [];

const req = () => new Request('http://localhost/api/provider-invites');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/provider-invites', () => {
  it('anonymous → 401, never touches the DB', async () => {
    auth.mockResolvedValue(undefined);

    const res = await GET(req());

    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('no profile row → empty list (not an error), no invites query', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // profile lookup: none

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ invites: [] });
    // Only the profile lookup ran — we never queried provider_staff.
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("returns only the caller's own 'invited' rows, joined to provider display fields", async () => {
    auth.mockResolvedValue(SESSION);
    const INVITES = [
      {
        id: 5,
        provider_id: 100,
        role: 'vet',
        status: 'invited',
        created_at: '2026-06-15T00:00:00.000Z',
        provider_name: 'Happy Paws',
        provider_type: 'vet',
        logo_url: null,
      },
    ];
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce(INVITES); // invited rows (joined)

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ invites: INVITES });

    // Self-scoped: bound to the resolved profile id, filtered to 'invited',
    // joined to providers for display, newest first.
    const text = queryTextOf(1);
    expect(text).toContain('FROM provider_staff');
    expect(text).toContain('LEFT JOIN providers');
    expect(text).toContain("ps.status = 'invited'");
    expect(text).toContain('ORDER BY ps.created_at DESC');
    expect(text).toContain('user_profile_id');
    // The only bound param is the caller's own profile id — no other user's id.
    expect(valuesOf(1)).toEqual([7]);
  });

  it('caller with no pending invites → empty list', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([]); // no invited rows

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ invites: [] });
  });

  it('a DB failure → 500', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockRejectedValueOnce(new Error('boom'));

    const res = await GET(req());

    expect(res.status).toBe(500);
  });
});
