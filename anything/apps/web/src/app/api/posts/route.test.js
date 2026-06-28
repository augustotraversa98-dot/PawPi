import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Route-level contract for the Following + Suggested feed (/api/posts GET).
// Session + DB are mocked at the module boundary — no live DB. sql is a tagged
// template; each `await sql\`...\`` consumes one mockResolvedValueOnce in order.
//
// pet_follows columns are follower_pet_id / followed_pet_id (migration 0012).
// "Public" here means all pets minus followed + own — there is no visibility
// column on pets yet.

import { GET, POST, mergeFeed } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

// Minimal enriched post rows — only the fields these tests assert on. The route
// passes whole rows through untouched, so a partial shape is enough.
const post = (id, pet_id) => ({ id, pet_id, pet_name: `pet${pet_id}` });

const feedReq = (qs = '') =>
  new Request(`http://localhost/api/posts${qs}`);

// Join the tagged-template strings of the Nth sql call back into one string so
// we can assert on the SQL the route actually issued.
const queryText = (callIndex) => sql.mock.calls[callIndex][0].join('?');
// The interpolated values of the Nth sql call (everything after the strings).
const queryValues = (callIndex) => sql.mock.calls[callIndex].slice(1);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('mergeFeed — Following-first, de-duped, paginated', () => {
  it('puts Following ahead of Suggested', () => {
    const following = [post(1, 10), post(2, 10)];
    const suggested = [post(3, 20), post(4, 30)];

    const out = mergeFeed(following, suggested, { limit: 20, offset: 0 });

    expect(out.map((p) => p.id)).toEqual([1, 2, 3, 4]);
  });

  it('tags each post with feed_group for the 2.58 divider', () => {
    const following = [post(1, 10), post(2, 10)];
    const suggested = [post(3, 20), post(4, 30)];

    const out = mergeFeed(following, suggested, { limit: 20, offset: 0 });

    expect(out.map((p) => p.feed_group)).toEqual([
      'following', 'following', 'suggested', 'suggested',
    ]);
  });

  it('drops a post id that appears in both groups (no duplicates)', () => {
    const following = [post(1, 10), post(2, 10)];
    // id 1 leaks into suggested — must not appear twice; Following wins.
    const suggested = [post(1, 10), post(3, 20)];

    const out = mergeFeed(following, suggested, { limit: 20, offset: 0 });

    expect(out.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(new Set(out.map((p) => p.id)).size).toBe(out.length);
  });

  it('slices the requested page window across the merged list', () => {
    const following = [post(1, 10), post(2, 10)];
    const suggested = [post(3, 20), post(4, 30), post(5, 40)];

    // Page 2 with limit 2 -> items at indices [2,3] of [1,2,3,4,5].
    const out = mergeFeed(following, suggested, { limit: 2, offset: 2 });

    expect(out.map((p) => p.id)).toEqual([3, 4]);
  });
});

describe('GET /api/posts — Following + Suggested', () => {
  it('returns followed pets first, then suggested, de-duped', async () => {
    auth.mockResolvedValue(undefined); // skip paw enrichment
    // 1: following query, 2: suggested query
    sql
      .mockResolvedValueOnce([post(1, 10), post(2, 10)])
      .mockResolvedValueOnce([post(3, 20), post(4, 30)]);

    const res = await GET(feedReq('?viewerPetId=1'));

    expect(res.status).toBe(200);
    const { posts } = await res.json();
    expect(posts.map((p) => p.id)).toEqual([1, 2, 3, 4]);
  });

  it('Suggested query excludes the followed set and the viewer own pet', async () => {
    auth.mockResolvedValue(undefined);
    sql
      .mockResolvedValueOnce([post(1, 10)]) // following
      .mockResolvedValueOnce([post(3, 20)]); // suggested

    await GET(feedReq('?viewerPetId=7'));

    // Call 0 = Following, Call 1 = Suggested.
    const suggestedSql = queryText(1).toLowerCase();
    expect(suggestedSql).toContain('not in');
    expect(suggestedSql).toContain('p.pet_id <>');
    // viewerPetId (7) is bound into the Suggested query for both guards.
    expect(queryValues(1)).toContain(7);
  });

  it('with no follows, Following is empty and Suggested still carries the feed', async () => {
    auth.mockResolvedValue(undefined);
    // viewerPetId present but follows nobody -> Following query returns [].
    sql
      .mockResolvedValueOnce([]) // following: empty
      .mockResolvedValueOnce([post(3, 20), post(4, 30)]); // suggested fills

    const res = await GET(feedReq('?viewerPetId=1'));

    const { posts } = await res.json();
    expect(posts.map((p) => p.id)).toEqual([3, 4]);
    expect(posts.length).toBeGreaterThan(0);
  });

  it("includes the viewer's OWN pet in the Following group (ticket 2.36)", async () => {
    auth.mockResolvedValue(undefined);
    sql
      .mockResolvedValueOnce([post(9, 7)]) // following+own
      .mockResolvedValueOnce([post(3, 20)]); // suggested

    await GET(feedReq('?viewerPetId=7'));

    // Call 0 = Following+own. It must select the viewer's own pet's posts too.
    const followingSql = queryText(0).toLowerCase();
    expect(followingSql).toContain('p.pet_id =');
    expect(queryValues(0)).toContain(7);
  });

  it('without viewerPetId, runs only the Suggested (global) query — no following filter', async () => {
    auth.mockResolvedValue(undefined);
    sql.mockResolvedValueOnce([post(3, 20), post(4, 30)]); // suggested only

    const res = await GET(feedReq());

    expect(res.status).toBe(200);
    // Only one query ran (no Following query without an active pet).
    expect(sql).toHaveBeenCalledTimes(1);
    const { posts } = await res.json();
    expect(posts.map((p) => p.id)).toEqual([3, 4]);
  });
});

// POST /api/posts — media_type + the daily-video eligibility gate. Enforcement is
// server-computed (isVideoEligible), driven here by VIDEO_ROLLOUT_PCT so 100/0 give
// deterministic eligible/ineligible. sql is mocked; each `await sql\`...\`` consumes
// one mockResolvedValueOnce in order.
const postReq = (body) =>
  new Request('http://localhost/api/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const ORIGINAL_PCT = process.env.VIDEO_ROLLOUT_PCT;
afterEach(() => {
  if (ORIGINAL_PCT === undefined) delete process.env.VIDEO_ROLLOUT_PCT;
  else process.env.VIDEO_ROLLOUT_PCT = ORIGINAL_PCT;
});

describe('POST /api/posts — media_type + daily-video gate', () => {
  it('eligible user creates a video post (201; media_type=video, video_url set, NOT trusting any client flag)', async () => {
    process.env.VIDEO_ROLLOUT_PCT = '100'; // everyone eligible
    auth.mockResolvedValue({ user: { id: 'auth-1' } });
    sql
      .mockResolvedValueOnce([{ id: 50 }]) // user_profiles lookup
      .mockResolvedValueOnce([{ id: 9 }]) // pet ownership
      .mockResolvedValueOnce([{ id: 123 }]) // INSERT ... RETURNING id
      .mockResolvedValueOnce([{ id: 123, media_type: 'video' }]); // full fetch

    const res = await POST(
      postReq({
        pet_id: 9,
        media_type: 'video',
        video_url: 'https://cdn/x.mp4',
        video_thumbnail_url: 'https://cdn/x.jpg',
      }),
    );

    expect(res.status).toBe(201);
    // The INSERT is the 3rd sql call (profile, pet, INSERT).
    const insertSql = queryText(2).toLowerCase();
    expect(insertSql).toContain('media_type');
    expect(insertSql).toContain('video_url');
    const insertValues = queryValues(2);
    expect(insertValues).toContain('video');
    expect(insertValues).toContain('https://cdn/x.mp4');
  });

  it('ineligible user is rejected 403 and NOTHING is inserted', async () => {
    process.env.VIDEO_ROLLOUT_PCT = '0'; // nobody eligible
    auth.mockResolvedValue({ user: { id: 'auth-1' } });
    sql
      .mockResolvedValueOnce([{ id: 50 }]) // user_profiles lookup
      .mockResolvedValueOnce([{ id: 9 }]); // pet ownership

    const res = await POST(
      postReq({
        pet_id: 9,
        media_type: 'video',
        video_url: 'https://cdn/x.mp4',
      }),
    );

    expect(res.status).toBe(403);
    // Only the profile + pet lookups ran — no INSERT.
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it('video post without video_url is rejected 400 before any eligibility check', async () => {
    process.env.VIDEO_ROLLOUT_PCT = '100';
    auth.mockResolvedValue({ user: { id: 'auth-1' } });
    sql
      .mockResolvedValueOnce([{ id: 50 }]) // profile
      .mockResolvedValueOnce([{ id: 9 }]); // pet

    const res = await POST(postReq({ pet_id: 9, media_type: 'video' }));

    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(2); // no INSERT
  });

  it('rejects an unknown media_type with 400', async () => {
    auth.mockResolvedValue({ user: { id: 'auth-1' } });
    sql.mockResolvedValueOnce([{ id: 50 }]); // profile

    const res = await POST(postReq({ pet_id: 9, media_type: 'gif' }));

    expect(res.status).toBe(400);
  });

  it('image post is unchanged — 201, media_type=image, video columns NULL (regression)', async () => {
    process.env.VIDEO_ROLLOUT_PCT = '0'; // irrelevant for images
    auth.mockResolvedValue({ user: { id: 'auth-1' } });
    sql
      .mockResolvedValueOnce([{ id: 50 }]) // profile
      .mockResolvedValueOnce([{ id: 9 }]) // pet
      .mockResolvedValueOnce([{ id: 200 }]) // INSERT
      .mockResolvedValueOnce([{ id: 200, media_type: 'image' }]); // full fetch

    const res = await POST(
      postReq({ pet_id: 9, image_url: 'https://cdn/p.jpg', caption: 'hi' }),
    );

    expect(res.status).toBe(201);
    const insertValues = queryValues(2);
    expect(insertValues).toContain('image'); // media_type defaulted to image
    // Both video columns are bound NULL for an image post.
    const nulls = insertValues.filter((v) => v === null).length;
    expect(nulls).toBeGreaterThanOrEqual(2);
  });
});
