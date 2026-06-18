import { describe, it, expect, vi, beforeEach } from 'vitest';

// DELETE /api/posts/[id] (ticket 2.36): owner-only post delete. Session + DB are
// mocked at the module boundary — sql is a tagged template consuming one
// mockResolvedValueOnce per `await sql\`...\`` in order.

import { DELETE, PATCH } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const req = () => new Request('http://localhost/api/posts/5', { method: 'DELETE' });
const queryText = (callIndex) => sql.mock.calls[callIndex][0].join('?');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('DELETE /api/posts/[id]', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(undefined);
    const res = await DELETE(req(), { params: { id: '5' } });
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('400 on a non-numeric id', async () => {
    const res = await DELETE(req(), { params: { id: 'abc' } });
    expect(res.status).toBe(400);
  });

  it('deletes only the caller-owned row and returns success', async () => {
    auth.mockResolvedValue({ user: { id: 'auth-1' } });
    sql
      .mockResolvedValueOnce([{ id: 42 }]) // user_profiles lookup -> userId 42
      .mockResolvedValueOnce([{ id: 5, is_daily_update: true, post_date: '2026-06-18' }]); // delete RETURNING

    const res = await DELETE(req(), { params: { id: '5' } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // The delete is scoped by BOTH id and user_id (owner-only).
    const delSql = queryText(1).toLowerCase();
    expect(delSql).toContain('delete from posts');
    expect(delSql).toContain('user_id =');
  });

  it("404 when the post isn't the caller's (RETURNING empty)", async () => {
    auth.mockResolvedValue({ user: { id: 'auth-1' } });
    sql
      .mockResolvedValueOnce([{ id: 42 }]) // userId
      .mockResolvedValueOnce([]); // delete matched nothing

    const res = await DELETE(req(), { params: { id: '5' } });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/posts/[id] — edit own caption (ticket 2.65)', () => {
  const patchReq = (body) =>
    new Request('http://localhost/api/posts/5', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });

  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(undefined);
    const res = await PATCH(patchReq({ caption: 'fixed' }), { params: { id: '5' } });
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('400 on a non-numeric id', async () => {
    const res = await PATCH(patchReq({ caption: 'fixed' }), { params: { id: 'abc' } });
    expect(res.status).toBe(400);
  });

  it('400 when caption is missing / not a string', async () => {
    auth.mockResolvedValue({ user: { id: 'auth-1' } });
    const res = await PATCH(patchReq({}), { params: { id: '5' } });
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it('400 when caption exceeds the max length', async () => {
    auth.mockResolvedValue({ user: { id: 'auth-1' } });
    const res = await PATCH(patchReq({ caption: 'x'.repeat(2001) }), {
      params: { id: '5' },
    });
    expect(res.status).toBe(400);
  });

  it('updates only the caption, owner-scoped, and stamps updated_at', async () => {
    auth.mockResolvedValue({ user: { id: 'auth-1' } });
    sql
      .mockResolvedValueOnce([{ id: 42 }]) // user_profiles lookup -> userId 42
      .mockResolvedValueOnce([
        { id: 5, caption: 'fixed typo', updated_at: '2026-06-18T00:00:00.000Z' },
      ]); // update RETURNING

    const res = await PATCH(patchReq({ caption: 'fixed typo', image_url: 'EVIL' }), {
      params: { id: '5' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.post.caption).toBe('fixed typo');

    const updSql = queryText(1).toLowerCase();
    expect(updSql).toContain('update posts');
    expect(updSql).toContain('set caption =');
    expect(updSql).toContain('updated_at = now()');
    // Owner-only and never touches the photo/daily fields.
    expect(updSql).toContain('user_id =');
    expect(updSql).not.toContain('image_url');
    expect(updSql).not.toContain('is_daily_update');
    expect(updSql).not.toContain('post_date');
  });

  it("404 when the post isn't the caller's (RETURNING empty)", async () => {
    auth.mockResolvedValue({ user: { id: 'auth-1' } });
    sql
      .mockResolvedValueOnce([{ id: 42 }]) // userId
      .mockResolvedValueOnce([]); // update matched nothing

    const res = await PATCH(patchReq({ caption: 'fixed' }), { params: { id: '5' } });
    expect(res.status).toBe(404);
  });
});
