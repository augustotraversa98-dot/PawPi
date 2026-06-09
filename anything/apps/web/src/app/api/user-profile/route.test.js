import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route-level smoke for GET /api/user-profile (PR #21 / TESTING_AND_CI_PLAN A2.2).
// Session and DB mocked at the module boundary — no live DB. Same contract as
// the pets smoke: authed -> 200, anonymous -> 401 (not 500). The auth()-no-
// longer-throws proof lives in __create/@auth/create.test.js; the profile
// lazy-creation INSERT path and a real round-trip are deferred to Phase C.

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

// Shared session contract: session.user.id is the auth id (auth_users.id).
const SESSION = {
  user: { id: 42, email: 'owner@example.com', name: 'Pat Owner' },
  expires: '9999999999',
};

// user_profiles row: its .id (7) is the application user id; auth_user_id (42)
// links back to the auth user.
const PROFILE_ROW = { id: 7, auth_user_id: 42, full_name: 'Pat Owner', username: 'pat', role: 'pet_owner' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/user-profile — authenticated path', () => {
  it('authed (profile exists) -> 200 with the profile', async () => {
    auth.mockResolvedValue(SESSION);
    // Profile lookup returns a row -> no INSERT, single sql call.
    sql.mockResolvedValueOnce([PROFILE_ROW]);

    const res = await GET(new Request('http://localhost/api/user-profile'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ profile: PROFILE_ROW });
  });

  it('anonymous -> 401, NOT 500, and never touches the DB', async () => {
    auth.mockResolvedValue(undefined);

    const res = await GET(new Request('http://localhost/api/user-profile'));

    expect(res.status).toBe(401);
    expect(res.status).not.toBe(500);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(sql).not.toHaveBeenCalled();
  });
});
