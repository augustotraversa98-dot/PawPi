import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/care-access/grants — the OWNER's view of who has access to their pets.
// auth() and `sql` are mocked at the module boundary; resolveUserId runs for real
// against the mocked sql. The sql call order is: 1) profile lookup, 2) the grants
// query (single tagged template carrying the owner scope + optional filters).
// Isolation: the WHERE owner_user_id = me clause is what excludes other owners.

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const NO_PARAMS = { params: {} };

const lastCall = () => sql.mock.calls[sql.mock.calls.length - 1];
const lastQueryText = () => (lastCall()?.[0] ?? []).join(' ');
const lastValues = () => lastCall()?.slice(1) ?? [];

const getReq = (qs = '') =>
  new Request(`http://localhost/api/care-access/grants${qs}`);

const arrange = (grants) => {
  auth.mockResolvedValue(SESSION);
  sql
    .mockResolvedValueOnce([PROFILE_ROW]) // profile
    .mockResolvedValueOnce(grants); // grants query
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/care-access/grants', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await GET(getReq(), NO_PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('404 when no user profile', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // no profile row
    const res = await GET(getReq(), NO_PARAMS);
    expect(res.status).toBe(404);
  });

  it('returns only the caller\'s grants, scoped by owner_user_id', async () => {
    arrange([
      { id: 1, pet_id: 5, owner_user_id: 7, provider_name: 'Dr Smith', pet_name: 'Rex' },
    ]);

    const res = await GET(getReq(), NO_PARAMS);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.grants).toHaveLength(1);
    // includes joined provider + pet names
    expect(json.grants[0].provider_name).toBe('Dr Smith');
    expect(json.grants[0].pet_name).toBe('Rex');

    const text = lastQueryText();
    expect(text).toContain('FROM care_access_grants');
    expect(text).toContain('owner_user_id =');
    expect(text).toContain('JOIN providers');
    expect(text).toContain('JOIN pets');
    expect(text).toContain('ORDER BY g.created_at DESC');
    // The owner id (7), resolved from the profile, scopes the query.
    expect(lastValues()).toContain(7);
  });

  it('passes ?petId and ?status filters into the query', async () => {
    arrange([]);
    const res = await GET(getReq('?petId=5&status=active'), NO_PARAMS);
    expect(res.status).toBe(200);

    const values = lastValues();
    expect(values).toContain('5'); // petId filter
    expect(values).toContain('active'); // status filter
  });

  it('no filters → both filter params bind null', async () => {
    arrange([]);
    const res = await GET(getReq(), NO_PARAMS);
    expect(res.status).toBe(200);
    // owner id present; both filters null (searchParams.get returns null when absent)
    const values = lastValues();
    expect(values).toContain(7);
    expect(values).toContain(null);
  });
});
