import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route-level contract for the one-directional follow model (pet_follows).
// Session + DB are mocked at the module boundary — no live DB. sql is a tagged
// template; each `await sql\`...\`` consumes one mockResolvedValueOnce in order.

import { POST, DELETE } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { isBlockedBetween } from '@/app/api/utils/moderation';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
vi.mock('@/app/api/utils/moderation', () => ({ isBlockedBetween: vi.fn() }));

// Identity chain: auth_users.id (42) -> user_profiles.auth_user_id (42) ->
// user_profiles.id (7) -> pets.owner_user_id (7).
const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7 };
const OWNED_PET = { id: 1 }; // follower pet, owned by profile 7
const FOLLOWED_PET = { id: 2, owner_user_id: 9 }; // owned by a DIFFERENT user (9)

// POST /api/pets/2/follow with body { followerPetId: 1 }
const followReq = (body = { followerPetId: 1 }) =>
  new Request('http://localhost/api/pets/2/follow', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

const unfollowReq = (body = { followerPetId: 1 }) =>
  new Request('http://localhost/api/pets/2/follow', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  vi.clearAllMocks();
  isBlockedBetween.mockResolvedValue(false);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/pets/[id]/follow', () => {
  // Flow audit F2-05: blocks are enforced on the API (a cached screen / direct call must not follow).
  it('403 when the pair is blocked (either direction): nothing inserted, nothing notified', async () => {
    auth.mockResolvedValue(SESSION);
    isBlockedBetween.mockResolvedValue(true);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([OWNED_PET])
      .mockResolvedValueOnce([FOLLOWED_PET]);
    const res = await POST(followReq(), { params: { id: '2' } });
    expect(res.status).toBe(403);
    expect(isBlockedBetween).toHaveBeenCalledWith(7, 9);
    const texts = sql.mock.calls.map((c) => (c?.[0] ?? []).join(' '));
    expect(texts.some((t) => t.includes('INSERT INTO pet_follows'))).toBe(false);
    expect(texts.some((t) => t.includes('app_notify'))).toBe(false);
  });

  it('inserts and returns following:true with followersCount; notifies the followed pet owner', async () => {
    auth.mockResolvedValue(SESSION);
    // 1: profile, 2: owned-pet, 3: followed-pet, 4: INSERT (RETURNING a new row),
    // 5: app_notify (ticket 2.26), 6: count
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([OWNED_PET])
      .mockResolvedValueOnce([FOLLOWED_PET])
      .mockResolvedValueOnce([{ follower_pet_id: 1 }]) // a genuine new follow
      .mockResolvedValueOnce([{ app_notify: 1 }]) // notify the owner
      .mockResolvedValueOnce([{ count: 1 }]);

    const res = await POST(followReq(), { params: { id: '2' } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ following: true, followersCount: 1 });
    // The notify targets the followed pet's owner (9), as the actor (7) — never self.
    const notifyCall = sql.mock.calls.find((c) =>
      (c?.[0] ?? []).join(" ").includes("app_notify"),
    );
    expect(notifyCall).toBeTruthy();
    const values = notifyCall.slice(1);
    expect(values).toContain(9); // recipient = followed pet owner
    expect(values).toContain(7); // actor = caller
    expect(values).toContain("follow");
  });

  it('is idempotent — a repeat follow 200s, no new row, and does NOT notify', async () => {
    auth.mockResolvedValue(SESSION);
    // ON CONFLICT DO NOTHING → RETURNING is empty → no notify, just the count.
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([OWNED_PET])
      .mockResolvedValueOnce([FOLLOWED_PET])
      .mockResolvedValueOnce([]) // no row inserted (already following)
      .mockResolvedValueOnce([{ count: 1 }]);

    const res = await POST(followReq(), { params: { id: '2' } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ following: true, followersCount: 1 });
    // No app_notify call on a repeat follow.
    const notifyCall = sql.mock.calls.find((c) =>
      (c?.[0] ?? []).join(" ").includes("app_notify"),
    );
    expect(notifyCall).toBeFalsy();
  });

  it('403 with a code when the caller neither owns followerPetId nor is family of it', async () => {
    auth.mockResolvedValue(SESSION);
    // profile found; owned-pet and family lookups are both empty.
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await POST(followReq(), { params: { id: '2' } });

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('follow_not_allowed');
  });

  it('family: checks blocks for the member AND for the dog owner', async () => {
    auth.mockResolvedValue(SESSION);
    isBlockedBetween.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([]) // not the owner
      .mockResolvedValueOnce([{ owner_user_id: 5 }]) // family of a dog owned by 5
      .mockResolvedValueOnce([FOLLOWED_PET]);

    const res = await POST(followReq(), { params: { id: '2' } });

    expect(res.status).toBe(403);
    expect(isBlockedBetween.mock.calls).toEqual([[7, 9], [5, 9]]);
    const texts = sql.mock.calls.map((c) => (c?.[0] ?? []).join(' '));
    expect(texts.some((t) => t.includes('INSERT INTO pet_follows'))).toBe(false);
  });

  it('404 when the followed pet does not exist', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([OWNED_PET])
      .mockResolvedValueOnce([]); // followed pet missing

    const res = await POST(followReq(), { params: { id: '2' } });

    expect(res.status).toBe(404);
  });

  it('400 when follower == followed', async () => {
    auth.mockResolvedValue(SESSION);
    // follow pet 1 with follower pet 1 (owned) -> self-follow rejected.
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([OWNED_PET]);

    const res = await POST(followReq({ followerPetId: 1 }), {
      params: { id: '1' },
    });

    expect(res.status).toBe(400);
  });

  it('401 when anonymous, and never touches the DB', async () => {
    auth.mockResolvedValue(undefined);

    const res = await POST(followReq(), { params: { id: '2' } });

    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/pets/[id]/follow', () => {
  it('removes the row and returns following:false with followersCount', async () => {
    auth.mockResolvedValue(SESSION);
    // 1: profile, 2: owned-pet, 3: DELETE, 4: count
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([OWNED_PET])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ count: 0 }]);

    const res = await DELETE(unfollowReq(), { params: { id: '2' } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ following: false, followersCount: 0 });
  });

  it('403 when the caller neither owns followerPetId nor is family of it', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await DELETE(unfollowReq(), { params: { id: '2' } });

    expect(res.status).toBe(403);
  });
});
