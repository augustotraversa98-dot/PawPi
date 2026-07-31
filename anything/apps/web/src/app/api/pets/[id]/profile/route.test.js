import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route-level contract for the social pet-profile read. Any authed user may read
// any pet's profile. Session + DB mocked at the module boundary.
//
// Query order (T3 added the moderation guard at index 1):
//   0 pet lookup · 1 guard (banned/blocked) · 2 owner · 3 stats ·
//   [4 follow check — only with viewerPetId] · 4|5 posts.

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };

// petRows includes owner_user_id (stripped from the response by the route).
const PET_ROW = {
  id: 2,
  name: 'Rex',
  handle: 'rex',
  avatar_url: 'http://img/rex.png',
  species: 'dog',
  breed: 'Lab',
  age_years: 3,
  age_months: 4,
  birthday: '2022-01-15',
  gender: 'male',
  owner_user_id: 7,
};
// T3 moderation guard: owner not banned, caller not blocked → profile visible.
const GUARD_OK = { banned: false, blocked: false };
const OWNER_ROW = {
  id: 7,
  full_name: 'Pat Owner',
  username: 'pat',
  avatar_url: 'http://img/pat.png',
};
const STAT_ROW = {
  total_posts: 2,
  total_paws: 5,
  total_barks: 1,
  followers: 3,
  following: 4,
};
const POST_ROWS = [
  {
    id: 10,
    image_url: 'http://img/10.png',
    caption: 'hi',
    post_date: '2026-06-10',
    is_daily_update: true,
    paw_count: 5,
    bark_count: 1,
  },
];

const req = (qs = '') =>
  new Request(`http://localhost/api/pets/2/profile${qs}`);

// Join the tagged-template strings of the Nth sql call back into one string so
// we can assert on the SQL the route actually issued; values are everything
// interpolated after the strings. (Same pattern as posts/route.test.js.)
const queryText = (callIndex) => sql.mock.calls[callIndex][0].join('?');
const queryValues = (callIndex) => sql.mock.calls[callIndex].slice(1);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/pets/[id]/profile', () => {
  it('returns pet + owner + stats + posts; isFollowing false without viewerPetId', async () => {
    auth.mockResolvedValue(SESSION);
    // 0 pet, 1 guard, 2 owner, 3 stats, 4 posts (no viewerPetId -> follow check skipped)
    sql
      .mockResolvedValueOnce([PET_ROW])
      .mockResolvedValueOnce([GUARD_OK])
      .mockResolvedValueOnce([OWNER_ROW])
      .mockResolvedValueOnce([STAT_ROW])
      .mockResolvedValueOnce(POST_ROWS);

    const res = await GET(req(), { params: { id: '2' } });

    expect(res.status).toBe(200);
    const body = await res.json();
    // owner_user_id is private plumbing — not surfaced.
    expect(body.pet).not.toHaveProperty('owner_user_id');
    expect(body.pet).not.toHaveProperty('notes');
    expect(body.pet.id).toBe(2);
    // Age model (docs/roadmap.md): the Dog Social Profile calculates age live
    // from birthday, so this route must select it — a prior version of this
    // route omitted birthday entirely, leaving the social profile unable to
    // ever show a calculated age.
    expect(body.pet.birthday).toBe('2022-01-15');
    expect(queryText(0).toLowerCase()).toContain('birthday');
    expect(body.owner).toEqual(OWNER_ROW);
    expect(body.stats).toEqual({
      totalPosts: 2,
      totalPaws: 5,
      totalBarks: 1,
      followers: 3,
      following: 4,
    });
    expect(body.isFollowing).toBe(false);
    expect(body.posts).toEqual(POST_ROWS);
  });

  it('isFollowing flips true when viewerPetId follows the pet', async () => {
    auth.mockResolvedValue(SESSION);
    // 0 pet, 1 guard, 2 owner, 3 stats, 4 follow check (non-empty), 5 posts
    sql
      .mockResolvedValueOnce([PET_ROW])
      .mockResolvedValueOnce([GUARD_OK])
      .mockResolvedValueOnce([OWNER_ROW])
      .mockResolvedValueOnce([STAT_ROW])
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce(POST_ROWS);

    const res = await GET(req('?viewerPetId=1'), { params: { id: '2' } });

    expect(res.status).toBe(200);
    expect((await res.json()).isFollowing).toBe(true);
  });

  it('returns empty posts[] and zeroed stats when there is nothing', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PET_ROW])
      .mockResolvedValueOnce([GUARD_OK])
      .mockResolvedValueOnce([OWNER_ROW])
      .mockResolvedValueOnce([
        { total_posts: 0, total_paws: 0, total_barks: 0, followers: 0, following: 0 },
      ])
      .mockResolvedValueOnce([]);

    const res = await GET(req(), { params: { id: '2' } });

    const body = await res.json();
    expect(body.posts).toEqual([]);
    expect(body.stats.totalPosts).toBe(0);
  });

  it('404 when the pet does not exist', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]);

    const res = await GET(req(), { params: { id: '999' } });

    expect(res.status).toBe(404);
  });

  it('404 when the owner is banned or the caller is blocked (T3)', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PET_ROW])
      .mockResolvedValueOnce([{ banned: false, blocked: true }]); // blocked → hidden

    const res = await GET(req(), { params: { id: '2' } });
    expect(res.status).toBe(404);
  });

  it('401 when anonymous, and never touches the DB', async () => {
    auth.mockResolvedValue(undefined);

    const res = await GET(req(), { params: { id: '2' } });

    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('each stat counts the right rows, scoped to the target pet', async () => {
    auth.mockResolvedValue(SESSION);
    // 0 pet, 1 guard, 2 owner, 3 stats, 4 posts (no viewerPetId)
    sql
      .mockResolvedValueOnce([PET_ROW])
      .mockResolvedValueOnce([GUARD_OK])
      .mockResolvedValueOnce([OWNER_ROW])
      .mockResolvedValueOnce([STAT_ROW])
      .mockResolvedValueOnce(POST_ROWS);

    await GET(req(), { params: { id: '2' } });

    // The single stats query (call index 3) sources each stat from the right
    // table/column, all scoped to the target pet.
    const statsSql = queryText(3).toLowerCase();
    expect(statsSql).toContain('from posts where pet_id'); // daily posts
    expect(statsSql).toContain('post_paws'); // paws
    expect(statsSql).toContain('post_barks'); // barks
    expect(statsSql).toContain('followed_pet_id'); // followers
    expect(statsSql).toContain('follower_pet_id'); // following
    // No retired mutual-friendship stat.
    expect(statsSql).not.toContain('pet_friendship');
    // The resolved pet id (PET_ROW.id) is the only id bound into the stats query.
    expect(queryValues(3)).toEqual([2, 2, 2, 2, 2]);
  });

  it('resolves a handle to the right pet, then scopes by the resolved id', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PET_ROW]) // pet looked up by handle -> id 2
      .mockResolvedValueOnce([GUARD_OK])
      .mockResolvedValueOnce([OWNER_ROW])
      .mockResolvedValueOnce([STAT_ROW])
      .mockResolvedValueOnce(POST_ROWS);

    const res = await GET(req(), { params: { id: 'rex' } });

    expect(res.status).toBe(200);
    // Lookup query filters by handle, binding the raw handle string.
    expect(queryText(0).toLowerCase()).toContain('where handle =');
    expect(queryValues(0)).toEqual(['rex']);
    // Downstream stats + moments bind the RESOLVED numeric id (2), never 'rex'.
    expect(queryValues(3)).toEqual([2, 2, 2, 2, 2]);
    expect(queryValues(4)).toContain(2);
    expect(queryValues(4)).not.toContain('rex');
  });

  it('tolerates a leading @ on a handle', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PET_ROW])
      .mockResolvedValueOnce([GUARD_OK])
      .mockResolvedValueOnce([OWNER_ROW])
      .mockResolvedValueOnce([STAT_ROW])
      .mockResolvedValueOnce(POST_ROWS);

    await GET(req(), { params: { id: '@rex' } });

    expect(queryText(0).toLowerCase()).toContain('where handle =');
    expect(queryValues(0)).toEqual(['rex']); // '@' stripped before binding
  });

  it('isolates one pet from another: only the resolved id is ever bound', async () => {
    auth.mockResolvedValue(SESSION);
    // Target pet A is id 2; pet B (id 99) must never leak into any query.
    sql
      .mockResolvedValueOnce([PET_ROW]) // id 2
      .mockResolvedValueOnce([GUARD_OK])
      .mockResolvedValueOnce([OWNER_ROW])
      .mockResolvedValueOnce([STAT_ROW])
      .mockResolvedValueOnce(POST_ROWS);

    await GET(req(), { params: { id: '2' } });

    const everyBoundValue = sql.mock.calls.flatMap((call) => call.slice(1));
    expect(everyBoundValue).not.toContain(99);
    // Stats + moments are scoped strictly to pet 2.
    expect(queryValues(3)).toEqual([2, 2, 2, 2, 2]);
    expect(queryValues(4)).toContain(2);
  });

  it('paginates daily moments with explicit limit/offset', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PET_ROW])
      .mockResolvedValueOnce([GUARD_OK])
      .mockResolvedValueOnce([OWNER_ROW])
      .mockResolvedValueOnce([STAT_ROW])
      .mockResolvedValueOnce(POST_ROWS);

    await GET(req('?limit=2&offset=4'), { params: { id: '2' } });

    const postsSql = queryText(4).toLowerCase();
    expect(postsSql).toContain('limit');
    expect(postsSql).toContain('offset');
    // resolved pet id + limit + offset are bound.
    expect(queryValues(4)).toEqual([2, 2, 4]);
  });

  it('defaults the moments page to a grid-sized window (limit 24, offset 0)', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PET_ROW])
      .mockResolvedValueOnce([GUARD_OK])
      .mockResolvedValueOnce([OWNER_ROW])
      .mockResolvedValueOnce([STAT_ROW])
      .mockResolvedValueOnce(POST_ROWS);

    await GET(req(), { params: { id: '2' } });

    expect(queryValues(4)).toEqual([2, 24, 0]);
  });
});
