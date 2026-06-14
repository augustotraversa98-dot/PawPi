import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/providers/[id]/staff/accept — the invitee accepts/declines their own
// invite. This is the ONE staff route that does NOT use requireProviderRole, so
// providerAuth is intentionally NOT involved. Invitee-self authorization lives in
// the scoped UPDATE: only a row whose user_profile_id equals the CALLER's own
// user_profiles.id AND whose status is 'invited' is touched. A different user, or
// a caller with no pending invite, matches no row (mock resolves []) -> 404.

import { POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: '100' } };

const queryTextOf = (callIndex) =>
  (sql.mock.calls[callIndex]?.[0] ?? []).join(' ');
const valuesOf = (callIndex) => sql.mock.calls[callIndex]?.slice(1) ?? [];

const acceptReq = (body) =>
  new Request('http://localhost/api/providers/100/staff/accept', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/providers/[id]/staff/accept', () => {
  it('anonymous → 401, never touches the DB', async () => {
    auth.mockResolvedValue(undefined);
    const res = await POST(acceptReq({}), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('invitee accepts → status flips to active, scoped to self + provider', async () => {
    auth.mockResolvedValue(SESSION);
    const ACTIVE = { id: 5, provider_id: 100, user_profile_id: 7, status: 'active' };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([ACTIVE]); // scoped UPDATE RETURNING
    const res = await POST(acceptReq({}), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ staff: ACTIVE });
    const text = queryTextOf(1);
    expect(text).toContain('UPDATE provider_staff');
    expect(text).toContain("status = 'invited'");
    // Bound to the new status, the path provider id, and the CALLER's own id.
    expect(valuesOf(1)).toEqual(expect.arrayContaining(['active', '100', 7]));
  });

  it('caller with no invite for this provider → 404', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([]); // no pending 'invited' row for this caller
    const res = await POST(acceptReq({}), PARAMS);

    expect(res.status).toBe(404);
  });

  it("a different user cannot accept someone else's invite → 404 (scoped to caller id)", async () => {
    // The caller is user_profiles.id 7, but the only invited row belongs to
    // someone else. The user_profile_id-scoped UPDATE matches nothing -> 404, and
    // the caller's own id (7) is what was bound — never the invitee's.
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup -> caller is 7
      .mockResolvedValueOnce([]); // no invited row for caller 7
    const res = await POST(acceptReq({}), PARAMS);

    expect(res.status).toBe(404);
    expect(valuesOf(1)).toContain(7);
  });

  it('decline → soft-removes the invite (status removed)', async () => {
    auth.mockResolvedValue(SESSION);
    const REMOVED = { id: 5, provider_id: 100, user_profile_id: 7, status: 'removed' };
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([REMOVED]);
    const res = await POST(acceptReq({ action: 'decline' }), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ staff: REMOVED });
    expect(valuesOf(1)).toContain('removed');
  });
});
