import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET/POST /api/providers/[id]/posts — storefront posts (ticket 2.22). List (any
// active staff) and compose (any active staff is the author). A post needs text or
// at least one image; bad image_urls → 400. auth(), `sql`, providerAuth mocked.

import { GET, POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { requireProviderRole } from '@/app/api/utils/providerAuth';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn(), getActiveTx: () => null }));
vi.mock('@/app/api/utils/providerAuth', () => ({
  requireProviderRole: vi.fn(),
  ALL_PROVIDER_ROLES: ['owner', 'admin', 'staff', 'vet'],
}));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: '100' } };

const forbidden = () =>
  Object.assign(new Error('Not authorized for this provider'), { status: 403 });

const queryTextOf = (callIndex) =>
  (sql.mock.calls[callIndex]?.[0] ?? []).join(' ');
const valuesOf = (callIndex) => sql.mock.calls[callIndex]?.slice(1) ?? [];

const postReq = (body) =>
  new Request('http://localhost/api/providers/100/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/providers/[id]/posts', () => {
  it('non-staff → 403, checked with the read-all role set', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockRejectedValue(forbidden());

    const res = await GET(
      new Request('http://localhost/api/providers/100/posts'),
      PARAMS,
    );

    expect(res.status).toBe(403);
    expect(requireProviderRole).toHaveBeenCalledWith('100', 7, [
      'owner',
      'admin',
      'staff',
      'vet',
    ]);
  });

  it('active staff → posts (newest first) each with paw_count + comment_count', async () => {
    auth.mockResolvedValue(SESSION);
    const POSTS = [{ id: 2, body: 'New' }, { id: 1, body: 'Old' }];
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // 0: profile lookup
      .mockResolvedValueOnce(POSTS) // 1: posts select
      .mockResolvedValueOnce([{ ok: true }]) // 2: provider_post_paws probe
      .mockResolvedValueOnce([{ ok: true }]) // 3: provider_post_comments probe
      .mockResolvedValueOnce([{ post_id: 2, n: 3 }]) // 4: paw counts
      .mockResolvedValueOnce([
        { post_id: 2, n: 1 },
        { post_id: 1, n: 5 },
      ]); // 5: comment counts
    requireProviderRole.mockResolvedValue({ id: 1, role: 'staff' });

    const res = await GET(
      new Request('http://localhost/api/providers/100/posts'),
      PARAMS,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      posts: [
        { id: 2, body: 'New', paw_count: 3, comment_count: 1 },
        { id: 1, body: 'Old', paw_count: 0, comment_count: 5 }, // no paw row → 0
      ],
    });
    expect(queryTextOf(1)).toContain('deleted_at IS NULL');
    expect(valuesOf(1)).toContain('100');
  });

  it('degrades to 0 counts when the paw/comment tables are absent (pre-migration)', async () => {
    auth.mockResolvedValue(SESSION);
    const POSTS = [{ id: 2, body: 'New' }];
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce(POSTS) // posts
      .mockResolvedValueOnce([{ ok: false }]) // paws probe → absent
      .mockResolvedValueOnce([{ ok: false }]); // comments probe → absent
    requireProviderRole.mockResolvedValue({ id: 1, role: 'staff' });

    const res = await GET(
      new Request('http://localhost/api/providers/100/posts'),
      PARAMS,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      posts: [{ id: 2, body: 'New', paw_count: 0, comment_count: 0 }],
    });
  });
});

describe('POST /api/providers/[id]/posts — create', () => {
  it('non-staff → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockRejectedValue(forbidden());

    const res = await POST(postReq({ body: 'Hi' }), PARAMS);

    expect(res.status).toBe(403);
  });

  it('empty post (no text, no images) → 400, no insert', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'staff' });

    const res = await POST(postReq({ body: '   ' }), PARAMS);

    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(1); // profile lookup only
  });

  it('bad image_urls shape → 400, no insert', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'staff' });

    const res = await POST(
      postReq({ body: 'Hi', image_urls: 'nope' }),
      PARAMS,
    );

    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('staff → creates the post; author is the caller, scoped to the provider', async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = { id: 9, provider_id: 100, body: 'Hello', author_user_id: 7 };
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([CREATED]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'staff' });

    const res = await POST(
      postReq({ body: 'Hello', image_urls: ['https://x/a.png'] }),
      PARAMS,
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ post: CREATED });
    expect(queryTextOf(1)).toContain('INSERT INTO provider_posts');
    const values = valuesOf(1);
    expect(values).toContain('100'); // provider scope
    expect(values).toContain(7); // author = resolved user id
    expect(values).toEqual(expect.arrayContaining([['https://x/a.png']]));
  });

  it('image-only post (no text) is allowed', async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = { id: 10, provider_id: 100, body: null };
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([CREATED]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'staff' });

    const res = await POST(
      postReq({ image_urls: ['https://x/a.png'] }),
      PARAMS,
    );

    expect(res.status).toBe(201);
    // Empty body is stored as NULL (not the empty string).
    expect(valuesOf(1)).toContain(null);
  });

  // Business daily moments + video (migration 0087).
  it('staff → creates a VIDEO post; media_type + video_url flow into the insert', async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = {
      id: 11,
      provider_id: 100,
      media_type: 'video',
      video_url: 'https://cdn/x.mp4',
    };
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([CREATED]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'staff' });

    const res = await POST(
      postReq({
        media_type: 'video',
        video_url: 'https://cdn/x.mp4',
        video_thumbnail_url: 'https://cdn/x.jpg',
      }),
      PARAMS,
    );

    expect(res.status).toBe(201);
    const insertSql = queryTextOf(1).toLowerCase();
    expect(insertSql).toContain('media_type');
    expect(insertSql).toContain('video_url');
    const values = valuesOf(1);
    expect(values).toContain('video');
    expect(values).toContain('https://cdn/x.mp4');
  });

  it('video post without a video_url → 400, no insert', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'staff' });

    const res = await POST(postReq({ media_type: 'video' }), PARAMS);

    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('unknown media_type → 400, no insert', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'staff' });

    const res = await POST(
      postReq({ media_type: 'gif', image_urls: ['https://x/a.png'] }),
      PARAMS,
    );

    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('pre-migration (media columns absent) → a video post gets a clean 409, never a 500', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockRejectedValueOnce(Object.assign(new Error('column'), { code: '42703' }));
    requireProviderRole.mockResolvedValue({ id: 1, role: 'staff' });

    const res = await POST(
      postReq({ media_type: 'video', video_url: 'https://cdn/x.mp4' }),
      PARAMS,
    );

    expect(res.status).toBe(409);
  });

  it('pre-migration → an image post falls back to the base insert (still 201)', async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = { id: 12, provider_id: 100, body: 'Hi' };
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockRejectedValueOnce(Object.assign(new Error('column'), { code: '42703' })) // media-aware insert
      .mockResolvedValueOnce([CREATED]); // base insert
    requireProviderRole.mockResolvedValue({ id: 1, role: 'staff' });

    const res = await POST(postReq({ body: 'Hi' }), PARAMS);

    expect(res.status).toBe(201);
    // The fallback is the base column list — no media columns.
    expect(queryTextOf(2).toLowerCase()).not.toContain('media_type');
  });
});
