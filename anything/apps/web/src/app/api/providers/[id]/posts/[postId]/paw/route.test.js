import { describe, it, expect, vi, beforeEach } from 'vitest';

// Paws on a provider post (ticket 2.94) — the PRE-MIGRATION degrade path + the id/auth guards.
// auth(), `sql` and resolveUserId are mocked at the module boundary; these unit tests drive the
// handler directly to exercise the branches the real-Postgres integration harness can't (the harness
// always HAS the provider_post_paws table, so the 42P01 undefined_table degrade only surfaces here).
// The real-router + RLS + paw/unpaw/count flow are proven in provider-post-paws.integration.test.ts.

import { POST, DELETE } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { resolveUserId } from '@/app/api/utils/currentUser';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
vi.mock('@/app/api/utils/currentUser', () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PARAMS = { params: { id: '100', postId: '500' } };
const undefinedTable = () =>
  Object.assign(new Error('relation "provider_post_paws" does not exist'), { code: '42P01' });

const pawReq = (method) =>
  new Request('http://localhost/api/providers/100/posts/500/paw', { method });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  auth.mockResolvedValue(SESSION);
  resolveUserId.mockResolvedValue(7);
});

describe('POST paw', () => {
  it('401 for a guest', async () => {
    auth.mockResolvedValueOnce(null);
    const res = await POST(pawReq('POST'), PARAMS);
    expect(res.status).toBe(401);
  });

  it('404 for a non-integer post id (never binds a non-integer as SQL int)', async () => {
    const res = await POST(pawReq('POST'), { params: { id: '100', postId: 'x' } });
    expect(res.status).toBe(404);
    expect(sql).not.toHaveBeenCalled();
  });

  it('paws a visible post: idempotent insert + returns the new count', async () => {
    sql
      .mockResolvedValueOnce([{ '?column?': 1 }]) // visibility gate → post exists
      .mockResolvedValueOnce(undefined) // INSERT ... ON CONFLICT DO NOTHING
      .mockResolvedValueOnce([{ count: 1 }]); // COUNT(*)
    const res = await POST(pawReq('POST'), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ paw_count: 1, is_pawed: true });
  });

  it('PRE-MIGRATION: a 42P01 on the insert degrades to { paw_count: 0, is_pawed: false } (no 500)', async () => {
    sql
      .mockResolvedValueOnce([{ '?column?': 1 }]) // visibility gate → post exists
      .mockRejectedValueOnce(undefinedTable()); // INSERT → table missing
    const res = await POST(pawReq('POST'), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, paw_count: 0, is_pawed: false });
  });

  it('404 when the post is gone/hidden (visibility gate returns no row)', async () => {
    sql.mockResolvedValueOnce([]); // visibility gate → nothing
    const res = await POST(pawReq('POST'), PARAMS);
    expect(res.status).toBe(404);
  });
});

describe('DELETE paw', () => {
  it('401 for a guest', async () => {
    auth.mockResolvedValueOnce(null);
    const res = await DELETE(pawReq('DELETE'), PARAMS);
    expect(res.status).toBe(401);
  });

  it('un-paws and returns the new count', async () => {
    sql
      .mockResolvedValueOnce(undefined) // DELETE
      .mockResolvedValueOnce([{ count: 0 }]); // COUNT(*)
    const res = await DELETE(pawReq('DELETE'), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ paw_count: 0, is_pawed: false });
  });

  it('PRE-MIGRATION: a 42P01 on the delete degrades to the neutral zero state (no 500)', async () => {
    sql.mockRejectedValueOnce(undefinedTable()); // DELETE → table missing
    const res = await DELETE(pawReq('DELETE'), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, paw_count: 0, is_pawed: false });
  });
});
