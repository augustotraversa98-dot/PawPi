import { describe, it, expect, vi, beforeEach } from 'vitest';

// DELETE /api/providers/[id]/posts/[postId] — SOFT delete a storefront post (ticket
// 2.22). Any active staff member may remove. Soft delete = set deleted_at (an UPDATE,
// never a row delete). Scoped by BOTH provider :id and postId, so a post of another
// provider matches no row → 404. auth(), `sql`, providerAuth mocked.

import { DELETE, GET, PATCH } from './route';
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

// PATCH — EDIT body/image_urls (ticket 2.22). Any active staff may edit; replaces both fields
// and enforces the "text or at least one image" invariant. Scoped by both ids + non-deleted.
describe('PATCH /api/providers/[id]/posts/[postId]', () => {
  const patchReq = (body) =>
    new Request('http://localhost/api/providers/100/posts/9', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('non-staff → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockRejectedValue(forbidden());

    const res = await PATCH(patchReq({ body: 'Updated' }), PARAMS);

    expect(res.status).toBe(403);
  });

  it('staff → UPDATEs body + image_urls, scoped by both ids', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([
        { id: 9, provider_id: 100, author_user_id: 5, body: 'Updated', image_urls: [] },
      ]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'staff' });

    const res = await PATCH(patchReq({ body: 'Updated', image_urls: [] }), PARAMS);

    expect(res.status).toBe(200);
    expect((await res.json()).post).toMatchObject({ id: 9, body: 'Updated' });
    const text = queryTextOf(1);
    expect(text).toContain('UPDATE provider_posts');
    expect(text).toContain('image_urls =');
    expect(text).toContain('deleted_at IS NULL');
    expect(valuesOf(1)).toEqual(expect.arrayContaining(['9', '100']));
  });

  it('empty text and no images → 400', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'staff' });

    const res = await PATCH(patchReq({ body: '   ', image_urls: [] }), PARAMS);

    expect(res.status).toBe(400);
  });

  it('cross-provider / deleted post → 404 (no row matches)', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([]); // no row
    requireProviderRole.mockResolvedValue({ id: 1, role: 'staff' });

    const res = await PATCH(patchReq({ body: 'Updated' }), PARAMS);

    expect(res.status).toBe(404);
  });
});

// GET — PUBLIC single-post view (Guideline 1.2): visible only when the provider is published
// and the post is non-deleted AND non-hidden; a hidden/removed post 404s on direct view.
describe('GET /api/providers/[id]/posts/[postId]', () => {
  const getReq = () =>
    new Request('http://localhost/api/providers/100/posts/9');

  it('anonymous → 401, no query', async () => {
    auth.mockResolvedValue(undefined);
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('published provider + visible post → 200 with author_user_id + is_own', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([
      { id: 9, provider_id: 100, body: 'Hi', image_urls: [], author_user_id: 5, is_own: false },
    ]);

    const res = await GET(getReq(), PARAMS);

    expect(res.status).toBe(200);
    expect((await res.json()).post).toMatchObject({ id: 9, author_user_id: 5 });
    // The visibility window is enforced in SQL: published provider + non-deleted + non-hidden.
    const text = queryTextOf(0);
    expect(text).toContain('provider_posts');
    expect(text).toContain('hidden_at IS NULL');
    expect(text).toContain('deleted_at IS NULL');
    expect(text).toContain("status = 'published'");
    expect(valuesOf(0)).toEqual(expect.arrayContaining([9, 100]));
  });

  it('hidden / removed / draft-provider post → 404 (no row matches the visibility window)', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // hidden_at set (or deleted / unpublished) → no row

    const res = await GET(getReq(), PARAMS);

    expect(res.status).toBe(404);
  });
});
