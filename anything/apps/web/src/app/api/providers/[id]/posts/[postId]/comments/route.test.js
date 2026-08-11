import { describe, it, expect, vi, beforeEach } from 'vitest';

// Provider-post comments — pet attribution (0084) + the PRE-MIGRATION degrade path. auth(), `sql`
// and resolveUserId are mocked at the module boundary; these unit tests drive the handler directly
// to exercise the branches the real-Postgres integration harness can't (the harness always HAS the
// pet_id column, so the 42703 undefined_column fallback only surfaces here). Real-router + RLS +
// owner-only pet check are proven in provider-post-comments.integration.test.ts.

import { GET, POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { resolveUserId } from '@/app/api/utils/currentUser';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
vi.mock('@/app/api/utils/currentUser', () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PARAMS = { params: { id: '100', postId: '500' } };
const undefinedColumn = () => Object.assign(new Error('column "pet_id" does not exist'), { code: '42703' });

const getReq = () =>
  new Request('http://localhost/api/providers/100/posts/500/comments');
const postReq = (body) =>
  new Request('http://localhost/api/providers/100/posts/500/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET comments — pet attribution + degrade', () => {
  it('returns the pet name/@handle/avatar via the LEFT JOIN pets projection', async () => {
    sql.mockResolvedValueOnce([
      { id: 1, body: 'cute', author_username: 'demo', pet_name: 'Mango', pet_handle: 'mango', pet_avatar_url: 'a.jpg' },
    ]);
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(200);
    const { comments } = await res.json();
    expect(comments[0]).toMatchObject({ pet_handle: 'mango', pet_name: 'Mango' });
    // The primary query LEFT JOINs pets on the comment's pet_id.
    expect(sql.mock.calls[0][0].join(' ')).toContain('LEFT JOIN pets');
  });

  it('PRE-MIGRATION: a 42703 on the pet join falls back to the account-only projection (no 500)', async () => {
    sql
      .mockRejectedValueOnce(undefinedColumn()) // pet-join query → column missing
      .mockResolvedValueOnce([{ id: 1, body: 'cute', author_username: 'demo' }]); // account-only fallback
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(200);
    const { comments } = await res.json();
    expect(comments[0].author_username).toBe('demo');
    // Fallback query does NOT reference pet_id.
    expect(sql.mock.calls[1][0].join(' ')).not.toContain('pet_id');
  });
});

describe('POST comment — owner-only pet check + degrade', () => {
  beforeEach(() => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValue(7);
  });

  it('stores pet_id and returns the pet identity when the caller owns the pet', async () => {
    sql
      .mockResolvedValueOnce([{ ok: 1 }]) // post exists + visible
      .mockResolvedValueOnce([{ ok: 1 }]) // owns-pet check
      .mockResolvedValueOnce([{ id: 9, post_id: 500, provider_id: 100, author_user_id: 7, body: 'hi', created_at: 'now' }]) // insert w/ pet_id
      .mockResolvedValueOnce([{ author_username: 'demo', pet_name: 'Mango', pet_handle: 'mango', pet_avatar_url: 'a.jpg' }]); // enrich
    const res = await POST(postReq({ body: 'hi', petId: 3 }), PARAMS);
    expect(res.status).toBe(201);
    const { comment } = await res.json();
    expect(comment).toMatchObject({ pet_id: 3, pet_handle: 'mango' });
    // The insert names the pet_id column.
    expect(sql.mock.calls[2][0].join(' ')).toContain('pet_id');
  });

  it('rejects a petId the caller does NOT own → 400, no insert', async () => {
    sql
      .mockResolvedValueOnce([{ ok: 1 }]) // post exists
      .mockResolvedValueOnce([]); // owns-pet check → not owned
    const res = await POST(postReq({ body: 'hi', petId: 999 }), PARAMS);
    expect(res.status).toBe(400);
    // Only the post-existence + ownership queries ran; nothing was inserted.
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it('PRE-MIGRATION: a 42703 on the pet_id insert falls back to an account insert → 201, pet_id null', async () => {
    sql
      .mockResolvedValueOnce([{ ok: 1 }]) // post exists
      .mockRejectedValueOnce(undefinedColumn()) // insert w/ pet_id → column missing
      .mockResolvedValueOnce([{ id: 9, post_id: 500, provider_id: 100, author_user_id: 7, body: 'hi', created_at: 'now' }]) // account insert
      .mockResolvedValueOnce([{ author_username: 'demo', pet_name: null, pet_handle: null, pet_avatar_url: null }]); // enrich (storedPetId null)
    const res = await POST(postReq({ body: 'hi' }), PARAMS);
    expect(res.status).toBe(201);
    const { comment } = await res.json();
    expect(comment.pet_id).toBeNull();
    expect(comment.author_username).toBe('demo');
    // The fallback insert omits pet_id.
    expect(sql.mock.calls[2][0].join(' ')).not.toContain('pet_id');
  });

  it('a signed-out user → 401', async () => {
    auth.mockResolvedValueOnce(undefined);
    const res = await POST(postReq({ body: 'hi' }), PARAMS);
    expect(res.status).toBe(401);
  });
});
