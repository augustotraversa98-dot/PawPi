import { describe, it, expect, vi, beforeEach } from 'vitest';

// DELETE /api/providers/[id]/posts/[postId] — SOFT delete a storefront post (ticket
// 2.22). Any active staff member may remove. Soft delete = set deleted_at (an UPDATE,
// never a row delete). Scoped by BOTH provider :id and postId, so a post of another
// provider matches no row → 404. auth(), `sql`, providerAuth mocked.

import { DELETE } from './route';
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
const PARAMS = { params: { id: '100', postId: '9' } };

const forbidden = () =>
  Object.assign(new Error('Not authorized for this provider'), { status: 403 });

const queryTextOf = (callIndex) =>
  (sql.mock.calls[callIndex]?.[0] ?? []).join(' ');
const valuesOf = (callIndex) => sql.mock.calls[callIndex]?.slice(1) ?? [];

const deleteReq = () =>
  new Request('http://localhost/api/providers/100/posts/9', { method: 'DELETE' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('DELETE /api/providers/[id]/posts/[postId]', () => {
  it('non-staff → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockRejectedValue(forbidden());

    const res = await DELETE(deleteReq(), PARAMS);

    expect(res.status).toBe(403);
  });

  it('staff → SOFT deletes: an UPDATE deleted_at, scoped by both ids', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([{ id: 9 }]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'staff' });

    const res = await DELETE(deleteReq(), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const text = queryTextOf(1);
    expect(text).toContain('UPDATE provider_posts');
    expect(text).toContain('deleted_at = NOW()');
    expect(text).not.toContain('DELETE FROM');
    expect(valuesOf(1)).toEqual(expect.arrayContaining(['9', '100']));
  });

  it('cross-provider isolation: a post of another provider → 404', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([]); // no row
    requireProviderRole.mockResolvedValue({ id: 1, role: 'staff' });

    const res = await DELETE(deleteReq(), PARAMS);

    expect(res.status).toBe(404);
  });
});
