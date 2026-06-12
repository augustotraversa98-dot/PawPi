import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route-level contract for the social pet-profile read. Any authed user may read
// any pet's profile. Session + DB mocked at the module boundary.

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
  gender: 'male',
  owner_user_id: 7,
};
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/pets/[id]/profile', () => {
  it('returns pet + owner + stats + posts; isFollowing false without viewerPetId', async () => {
    auth.mockResolvedValue(SESSION);
    // 1: pet, 2: owner, 3: stats, 4: posts (no viewerPetId -> follow check skipped)
    sql
      .mockResolvedValueOnce([PET_ROW])
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
    // 1: pet, 2: owner, 3: stats, 4: follow check (non-empty), 5: posts
    sql
      .mockResolvedValueOnce([PET_ROW])
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

  it('401 when anonymous, and never touches the DB', async () => {
    auth.mockResolvedValue(undefined);

    const res = await GET(req(), { params: { id: '2' } });

    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });
});
