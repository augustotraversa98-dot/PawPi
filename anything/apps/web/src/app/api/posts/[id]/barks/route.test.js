import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route-level contract for pet-scoped barks (post_barks.pet_id, migration 0013).
// Session + DB are mocked at the module boundary — no live DB. sql is a tagged
// template; each `await sql\`...\`` consumes one mockResolvedValueOnce in order.

import { GET, POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

// Identity chain: auth_users.id (42) -> user_profiles.auth_user_id (42) ->
// user_profiles.id (7) -> pets.owner_user_id (7).
const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7 };
const OWNED_PET = { id: 1 };

// A fully enriched bark row as the joins return it.
const ENRICHED_BARK = {
  id: 100,
  post_id: 5,
  user_id: 7,
  pet_id: 1,
  text: 'woof',
  username: 'owner',
  avatar_url: 'https://files/owner.png',
  pet_handle: 'rex',
  pet_name: 'Rex',
  pet_avatar_url: 'https://files/rex.png',
};

// A legacy bark predating 0013: pet_id NULL, so the LEFT JOIN yields NULL pet_ fields.
const LEGACY_BARK = {
  id: 99,
  post_id: 5,
  user_id: 7,
  pet_id: null,
  text: 'old comment',
  username: 'owner',
  avatar_url: 'https://files/owner.png',
  pet_handle: null,
  pet_name: null,
  pet_avatar_url: null,
};

const postReq = (body = { text: 'woof', petId: 1 }) =>
  new Request('http://localhost/api/posts/5/barks', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/posts/[id]/barks', () => {
  it('returns barks carrying the four pet_ identity fields', async () => {
    sql.mockResolvedValueOnce([ENRICHED_BARK]);

    const res = await GET(new Request('http://localhost/api/posts/5/barks'), {
      params: { id: '5' },
    });

    expect(res.status).toBe(200);
    const { barks } = await res.json();
    expect(barks).toHaveLength(1);
    expect(barks[0]).toMatchObject({
      pet_id: 1,
      pet_handle: 'rex',
      pet_name: 'Rex',
      pet_avatar_url: 'https://files/rex.png',
    });
  });

  it('returns a legacy NULL-pet row safely (pet_ fields NULL, no error)', async () => {
    sql.mockResolvedValueOnce([LEGACY_BARK]);

    const res = await GET(new Request('http://localhost/api/posts/5/barks'), {
      params: { id: '5' },
    });

    expect(res.status).toBe(200);
    const { barks } = await res.json();
    expect(barks[0]).toMatchObject({
      pet_id: null,
      pet_handle: null,
      pet_name: null,
      pet_avatar_url: null,
    });
  });
});

describe('POST /api/posts/[id]/barks', () => {
  it('stores pet_id and returns the enriched row', async () => {
    auth.mockResolvedValue(SESSION);
    // 1: profile, 2: owned-pet, 3: post exists, 4: INSERT, 5: enriched select
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([OWNED_PET])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([{ id: 100 }])
      .mockResolvedValueOnce([ENRICHED_BARK]);

    const res = await POST(postReq(), { params: { id: '5' } });

    expect(res.status).toBe(201);
    const { bark } = await res.json();
    expect(bark).toMatchObject({
      pet_id: 1,
      pet_handle: 'rex',
      pet_name: 'Rex',
      pet_avatar_url: 'https://files/rex.png',
    });
  });

  it('notifies the post owner on a new bark (not the actor) — ticket 2.26', async () => {
    auth.mockResolvedValue(SESSION);
    // 1: profile (7), 2: owned-pet, 3: post owned by 9, 4: INSERT, 5: app_notify, 6: enriched
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([OWNED_PET])
      .mockResolvedValueOnce([{ id: 5, user_id: 9 }])
      .mockResolvedValueOnce([{ id: 100 }])
      .mockResolvedValueOnce([{ app_notify: 1 }])
      .mockResolvedValueOnce([ENRICHED_BARK]);

    const res = await POST(postReq(), { params: { id: '5' } });

    expect(res.status).toBe(201);
    const notifyCall = sql.mock.calls.find((c) =>
      (c?.[0] ?? []).join(' ').includes('app_notify'),
    );
    expect(notifyCall).toBeTruthy();
    const values = notifyCall.slice(1);
    expect(values).toContain(9); // recipient = post owner
    expect(values).toContain(7); // actor = caller
    expect(values).toContain('bark');
  });

  it('400 when petId is missing — never inserts', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);

    const res = await POST(postReq({ text: 'woof' }), { params: { id: '5' } });

    expect(res.status).toBe(400);
    // profile lookup ran; ownership/insert never did.
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('400 when petId is not owned by the caller — never inserts', async () => {
    auth.mockResolvedValue(SESSION);
    // profile found, but owned-pet lookup returns empty -> foreign pet.
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockResolvedValueOnce([]);

    const res = await POST(postReq({ text: 'woof', petId: 999 }), {
      params: { id: '5' },
    });

    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it('401 when anonymous, and never touches the DB', async () => {
    auth.mockResolvedValue(undefined);

    const res = await POST(postReq(), { params: { id: '5' } });

    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });
});
