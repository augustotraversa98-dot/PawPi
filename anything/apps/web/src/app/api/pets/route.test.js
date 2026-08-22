import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route-level smoke for the authenticated path (PR #21 / TESTING_AND_CI_PLAN A2.2).
// Session and DB are mocked at the module boundary — no live DB. The point is
// the route contract: authed -> 200, anonymous -> 401 (NOT 500).
//
// Why 401 and not 500: the auth detour's 500 came from auth() THROWING on an
// unset AUTH_URL (the throw escaped the route's try/catch). That throw is
// proven gone in __create/@auth/create.test.js — the only place that exercises
// the real auth() line. Here auth() is mocked, so this file deliberately does
// NOT re-test the throw; it pins the resulting anonymous contract instead. The
// throw->500 end-to-end through the live stack stays deferred to Phase C.

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

// Same session contract as create.test.js: session.user.id is the auth id
// (auth_users.id, integer) — the field the route guard reads.
const SESSION = {
  user: { id: 42, email: 'owner@example.com', name: 'Pat Owner' },
  expires: '9999999999',
};

// Identity chain: auth_users.id (42) -> user_profiles.auth_user_id (42) ->
// user_profiles.id (7) -> pets.owner_user_id (7). owner_user_id holds the
// PROFILE id, not the auth id.
const PROFILE_ROW = { id: 7, auth_user_id: 42, username: 'pat', onboarding_completed: true };
const PET_ROW = { id: 1, name: 'Rex', handle: 'rex', owner_user_id: 7, weight: 40, weight_unit: 'lbs' };

beforeEach(() => {
  vi.clearAllMocks();
  // Routes are chatty; keep test output clean.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/pets — authenticated path', () => {
  it('authed -> 200 with the user\'s pets', async () => {
    auth.mockResolvedValue(SESSION);
    // 1st sql call: profile lookup. 2nd: pets by owner. 3rd: the batched
    // latest-weight lookup (one query for all pets) — empty here, so the
    // fallback (pets.weight/weight_unit, already on PET_ROW) passes through
    // unchanged.
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([PET_ROW])
      .mockResolvedValueOnce([]);

    const res = await GET(new Request('http://localhost/api/pets'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pets: [PET_ROW] });
  });

  it('anonymous -> 401, NOT 500, and never touches the DB', async () => {
    auth.mockResolvedValue(undefined);

    const res = await GET(new Request('http://localhost/api/pets'));

    expect(res.status).toBe(401);
    expect(res.status).not.toBe(500);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(sql).not.toHaveBeenCalled();
  });
});
