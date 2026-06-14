import { describe, it, expect, vi, beforeEach } from 'vitest';

// DELETE/PATCH /api/providers/[id]/staff/[userProfileId] — remove (soft) and
// change role (owner|admin). Two cruxes:
//  - CROSS-PROVIDER ISOLATION: the membership lookup is scoped by BOTH the path
//    provider :id and userProfileId, so a member of a DIFFERENT provider matches
//    no row (the mock resolves []) -> 404, even for a legit owner of the path :id.
//  - OWNER PROTECTION: a row with role='owner' can be neither removed (403) nor
//    re-roled (400) — never orphan the provider, no ownership transfer.
// auth(), `sql`, providerAuth are mocked at the module boundary.

import { DELETE, PATCH } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { requireProviderRole } from '@/app/api/utils/providerAuth';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
vi.mock('@/app/api/utils/providerAuth', () => ({
  requireProviderRole: vi.fn(),
  ALL_PROVIDER_ROLES: ['owner', 'admin', 'staff', 'vet'],
}));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: '100', userProfileId: '99' } };

const forbidden = () =>
  Object.assign(new Error('Not authorized for this provider'), { status: 403 });

const queryTextOf = (callIndex) =>
  (sql.mock.calls[callIndex]?.[0] ?? []).join(' ');
const valuesOf = (callIndex) => sql.mock.calls[callIndex]?.slice(1) ?? [];

const deleteReq = () =>
  new Request('http://localhost/api/providers/100/staff/99', { method: 'DELETE' });

const patchReq = (body) =>
  new Request('http://localhost/api/providers/100/staff/99', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('DELETE /api/providers/[id]/staff/[userProfileId] — remove', () => {
  it('non-owner/admin → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockRejectedValue(forbidden());

    const res = await DELETE(deleteReq(), PARAMS);

    expect(res.status).toBe(403);
    expect(requireProviderRole).toHaveBeenCalledWith('100', 7);
  });

  it('owner removes a member → soft set status=removed (UPDATE, not delete)', async () => {
    auth.mockResolvedValue(SESSION);
    const REMOVED = { id: 5, status: 'removed', role: 'staff' };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([{ id: 5, role: 'staff', status: 'active' }]) // membership lookup
      .mockResolvedValueOnce([REMOVED]); // soft-delete UPDATE
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await DELETE(deleteReq(), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ staff: REMOVED });
    const text = queryTextOf(2);
    expect(text).toContain('UPDATE provider_staff');
    expect(text).toContain("status = 'removed'");
    expect(text).not.toContain('DELETE FROM');
    // Scoped by BOTH provider id and member id.
    expect(text).toContain('AND user_profile_id =');
    expect(valuesOf(2)).toEqual(expect.arrayContaining(['100', '99']));
  });

  it("removing a role='owner' member → 403, no UPDATE", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([{ id: 5, role: 'owner', status: 'active' }]); // membership is owner
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await DELETE(deleteReq(), PARAMS);

    expect(res.status).toBe(403);
    expect(sql).toHaveBeenCalledTimes(2); // lookup only, no soft-delete
  });

  it('cross-provider isolation: member belongs to a different provider → 404', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([]); // scoped membership lookup matches no row
    // Caller IS owner of the path provider (100), but the member belongs to
    // another provider, so the scoped lookup finds nothing.
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await DELETE(deleteReq(), PARAMS);

    expect(res.status).toBe(404);
    expect(sql).toHaveBeenCalledTimes(2);
  });
});

describe('PATCH /api/providers/[id]/staff/[userProfileId] — change role', () => {
  it('non-owner/admin → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockRejectedValue(forbidden());

    const res = await PATCH(patchReq({ role: 'staff' }), PARAMS);

    expect(res.status).toBe(403);
  });

  it('owner changes admin→staff', async () => {
    auth.mockResolvedValue(SESSION);
    const UPDATED = { id: 5, role: 'staff' };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([{ id: 5, role: 'admin', status: 'active' }]) // membership lookup
      .mockResolvedValueOnce([UPDATED]); // role UPDATE
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await PATCH(patchReq({ role: 'staff' }), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ staff: UPDATED });
    const text = queryTextOf(2);
    expect(text).toContain('UPDATE provider_staff');
    expect(text).toContain('AND user_profile_id =');
    expect(valuesOf(2)).toEqual(expect.arrayContaining(['staff', '100', '99']));
  });

  it("setting role='owner' → 400, no membership lookup", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // profile lookup only
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await PATCH(patchReq({ role: 'owner' }), PARAMS);

    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("changing the owner's role → 400, no UPDATE", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([{ id: 5, role: 'owner', status: 'active' }]); // target is the owner
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await PATCH(patchReq({ role: 'staff' }), PARAMS);

    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(2); // lookup only, no role UPDATE
  });

  it('cross-provider isolation: member belongs to a different provider → 404', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([]); // scoped membership lookup matches no row
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await PATCH(patchReq({ role: 'staff' }), PARAMS);

    expect(res.status).toBe(404);
    expect(sql).toHaveBeenCalledTimes(2);
  });
});
