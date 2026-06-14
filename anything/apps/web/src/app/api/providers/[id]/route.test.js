import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET/PATCH /api/providers/[id] — read one (any active staff) and profile update
// (owner|admin). auth(), `sql`, and the providerAuth chokepoint are mocked at the
// module boundary. requireProviderRole is the authorization gate: a rejection
// stands in for "not authorized" (no membership, wrong role, or — for a
// cross-provider call — staff of a different provider).

import { GET, PATCH } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { requireProviderRole } from '@/app/api/utils/providerAuth';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => {
  const fn = vi.fn();
  fn.unsafe = vi.fn();
  return { default: fn };
});
vi.mock('@/app/api/utils/providerAuth', () => ({
  requireProviderRole: vi.fn(),
  ALL_PROVIDER_ROLES: ['owner', 'admin', 'staff', 'vet'],
}));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: '100' } };

const forbidden = () => Object.assign(new Error('Not authorized for this provider'), { status: 403 });

const patchReq = (body) =>
  new Request('http://localhost/api/providers/100', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/providers/[id]', () => {
  it('anonymous → 401', async () => {
    auth.mockResolvedValue(undefined);
    const res = await GET(new Request('http://localhost/api/providers/100'), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('non-staff → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // profile lookup
    requireProviderRole.mockRejectedValue(forbidden());

    const res = await GET(new Request('http://localhost/api/providers/100'), PARAMS);

    expect(res.status).toBe(403);
    // Membership was checked with the read-all role set.
    expect(requireProviderRole).toHaveBeenCalledWith('100', 7, ['owner', 'admin', 'staff', 'vet']);
  });

  it('active staff → returns the provider and its staff list', async () => {
    auth.mockResolvedValue(SESSION);
    const PROVIDER = { id: 100, name: 'Happy Paws', status: 'draft' };
    const STAFF = [{ id: 1, role: 'owner', status: 'active' }];
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([PROVIDER]) // provider row
      .mockResolvedValueOnce(STAFF); // staff list
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await GET(new Request('http://localhost/api/providers/100'), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ provider: PROVIDER, staff: STAFF });
  });
});

describe('PATCH /api/providers/[id] — profile fields only', () => {
  it('non-owner/admin → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockRejectedValue(forbidden());

    const res = await PATCH(patchReq({ name: 'New' }), PARAMS);

    expect(res.status).toBe(403);
    // Mutations require owner|admin (the default role set).
    expect(requireProviderRole).toHaveBeenCalledWith('100', 7);
  });

  it('owner → updates profile fields', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // profile lookup
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });
    sql.unsafe.mockResolvedValueOnce([{ id: 100, name: 'New Name', bio: 'hi' }]);

    const res = await PATCH(patchReq({ name: 'New Name', bio: 'hi' }), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ provider: { id: 100, name: 'New Name', bio: 'hi' } });

    const [updateQuery, values] = sql.unsafe.mock.calls[0];
    expect(updateQuery).toContain('UPDATE providers');
    expect(updateQuery).toContain('name =');
    expect(updateQuery).toContain('updated_at = NOW()');
    expect(values).toEqual(['New Name', 'hi', '100']);
  });

  it('cannot change owner_user_profile_id or status via the profile path', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });
    sql.unsafe.mockResolvedValueOnce([{ id: 100, name: 'New' }]);

    // Body smuggles owner_user_profile_id and status alongside a real field.
    const res = await PATCH(
      patchReq({ name: 'New', status: 'published', owner_user_profile_id: 999 }),
      PARAMS,
    );

    expect(res.status).toBe(200);
    const [updateQuery, values] = sql.unsafe.mock.calls[0];
    expect(updateQuery).not.toContain('status =');
    expect(updateQuery).not.toContain('owner_user_profile_id =');
    expect(values).not.toContain('published');
    expect(values).not.toContain(999);
    // Only the whitelisted field + the WHERE id were bound.
    expect(values).toEqual(['New', '100']);
  });

  it('a status-only PATCH has nothing to update → 400 (status never flips here)', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await PATCH(patchReq({ status: 'published' }), PARAMS);

    expect(res.status).toBe(400);
    expect(sql.unsafe).not.toHaveBeenCalled();
  });

  it('rejects a slug already used by another provider → 409', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([{ id: 200 }]); // slug clash on a different provider
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await PATCH(patchReq({ slug: 'taken' }), PARAMS);

    expect(res.status).toBe(409);
    expect(sql.unsafe).not.toHaveBeenCalled();
  });

  it('cross-provider isolation: staff of A patching B → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    // Caller is staff of provider A, but the path id is provider B → no membership.
    requireProviderRole.mockRejectedValue(forbidden());

    const res = await PATCH(patchReq({ name: 'Hijack' }), PARAMS);

    expect(res.status).toBe(403);
    expect(sql.unsafe).not.toHaveBeenCalled();
  });
});
