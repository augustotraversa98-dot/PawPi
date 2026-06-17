import { describe, it, expect, vi, beforeEach } from 'vitest';

// DELETE /api/posts/[id] (ticket 2.36): owner-only post delete. Session + DB are
// mocked at the module boundary — sql is a tagged template consuming one
// mockResolvedValueOnce per `await sql\`...\`` in order.

import { DELETE } from './route';
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
