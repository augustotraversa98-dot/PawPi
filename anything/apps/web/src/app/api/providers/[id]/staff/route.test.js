import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/providers/[id]/staff — invite an existing user (owner|admin).
// auth(), `sql`, and the providerAuth chokepoint are mocked at the module
// boundary. requireProviderRole is the authorization gate: a rejection stands in
// for "not authorized" (no membership, wrong role, or staff of a different
// provider). The invitee is resolved by unique username; the UNIQUE(provider_id,
// user_profile_id) branches (already-member 409 vs removed re-invite) are driven
// by what the existing-membership SELECT mock resolves to.

import { POST } from './route';
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
const INVITEE_ROW = { id: 99 };
const PARAMS = { params: { id: '100' } };

const forbidden = () =>
  Object.assign(new Error('Not authorized for this provider'), { status: 403 });

const queryTextOf = (callIndex) =>
  (sql.mock.calls[callIndex]?.[0] ?? []).join(' ');
const valuesOf = (callIndex) => sql.mock.calls[callIndex]?.slice(1) ?? [];

const inviteReq = (body) =>
  new Request('http://localhost/api/providers/100/staff', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/providers/[id]/staff — invite', () => {
  it('anonymous → 401, never touches the DB', async () => {
    auth.mockResolvedValue(undefined);
    const res = await POST(inviteReq({ username: 'bob', role: 'staff' }), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('non-owner/admin → 403, checked with the default (owner|admin) role set', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // profile lookup
    requireProviderRole.mockRejectedValue(forbidden());

    const res = await POST(inviteReq({ username: 'bob', role: 'staff' }), PARAMS);

    expect(res.status).toBe(403);
    expect(requireProviderRole).toHaveBeenCalledWith('100', 7);
  });

  it('role=owner → 400, no invitee lookup', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // profile lookup
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await POST(inviteReq({ username: 'bob', role: 'owner' }), PARAMS);

    expect(res.status).toBe(400);
    // Only the profile lookup ran; we never resolved the invitee or inserted.
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('unknown invitee → 404', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([]); // invitee lookup: no such username
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await POST(inviteReq({ username: 'ghost', role: 'staff' }), PARAMS);

    expect(res.status).toBe(404);
  });

  it('owner invites an existing user → creates an invited row with the given role', async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = {
      id: 5,
      provider_id: 100,
      user_profile_id: 99,
      role: 'staff',
      status: 'invited',
    };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([INVITEE_ROW]) // invitee lookup
      .mockResolvedValueOnce([]) // existing-membership lookup: none
      .mockResolvedValueOnce([CREATED]); // insert
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await POST(inviteReq({ username: 'bob', role: 'staff' }), PARAMS);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ staff: CREATED });
    const text = queryTextOf(3);
    expect(text).toContain('INSERT INTO provider_staff');
    // Bound to the path provider id and the resolved invitee + role.
    expect(valuesOf(3)).toEqual(expect.arrayContaining(['100', 99, 'staff']));
  });

  it('inviting an already-active member → 409, no insert', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([INVITEE_ROW]) // invitee lookup
      .mockResolvedValueOnce([{ id: 5, status: 'active' }]); // existing: active
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await POST(inviteReq({ username: 'bob', role: 'staff' }), PARAMS);

    expect(res.status).toBe(409);
    // No fourth query (no insert / re-invite update).
    expect(sql).toHaveBeenCalledTimes(3);
  });

  it('inviting an already-invited member → 409', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([INVITEE_ROW])
      .mockResolvedValueOnce([{ id: 5, status: 'invited' }]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await POST(inviteReq({ username: 'bob', role: 'staff' }), PARAMS);

    expect(res.status).toBe(409);
    expect(sql).toHaveBeenCalledTimes(3);
  });

  it('re-inviting a removed member → UPDATEs that row back to invited, no duplicate insert', async () => {
    auth.mockResolvedValue(SESSION);
    const REINVITED = { id: 5, status: 'invited', role: 'vet' };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([INVITEE_ROW]) // invitee lookup
      .mockResolvedValueOnce([{ id: 5, status: 'removed' }]) // existing: removed
      .mockResolvedValueOnce([REINVITED]); // re-invite UPDATE
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await POST(inviteReq({ username: 'bob', role: 'vet' }), PARAMS);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ staff: REINVITED });
    const text = queryTextOf(3);
    // It is an UPDATE of the existing row, NOT an INSERT.
    expect(text).toContain('UPDATE provider_staff');
    expect(text).not.toContain('INSERT');
    expect(valuesOf(3)).toEqual(expect.arrayContaining(['vet', 5]));
  });
});
