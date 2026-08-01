import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/me/bookings — the OWNER's bookings across ALL services (ticket 2.14, owner hub). An
// owner-scoped read (WHERE owner_user_id = me); never requireProviderRole. auth() + `sql` +
// resolveUserId mocked at the module boundary (like /api/shop/orders). Asserts anon→401,
// owner-scoping, and the split upcoming/past shape.

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { resolveUserId } from '@/app/api/utils/currentUser';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
vi.mock('@/app/api/utils/currentUser', () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const req = () => new Request('http://localhost/api/me/bookings');
const allQueryTexts = () => sql.mock.calls.map((c) => (c[0] ?? []).join(' '));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe('GET /api/me/bookings', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('404 when the caller has no profile', async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValueOnce(null);
    const res = await GET(req());
    expect(res.status).toBe(404);
  });

  it('returns split upcoming/past, both scoped to owner_user_id', async () => {
    auth.mockResolvedValue(SESSION);
    const UPCOMING = [{ id: 1, provider_name: 'Vet A', pet_name: 'Rex' }];
    const PAST = [{ id: 2, provider_name: 'Groomer B', pet_name: 'Rex' }];
    sql.mockResolvedValueOnce(UPCOMING).mockResolvedValueOnce(PAST);

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ upcoming: UPCOMING, past: PAST });

    for (const text of allQueryTexts()) {
      expect(text).toContain('FROM vet_appointments');
      expect(text).toContain('va.owner_user_id =');
      expect(text).toContain('deleted_at IS NULL');
      // provider_slug is needed to route a tapped booking row to its per-service screen
      // (the mobile My Hub, ticket 2.14 follow-up).
      expect(text).toContain('pr.slug AS provider_slug');
    }
    // owner id (7) is bound, NOT a provider id.
    const boundValues = sql.mock.calls.flatMap((c) => c.slice(1));
    expect(boundValues).toContain(7);
  });

  it('empty → { upcoming: [], past: [] }', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const res = await GET(req());
    expect(await res.json()).toEqual({ upcoming: [], past: [] });
  });
});
