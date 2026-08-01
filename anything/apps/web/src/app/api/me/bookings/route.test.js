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
const req = (qs = '') => new Request(`http://localhost/api/me/bookings${qs}`);
const allQueryTexts = () => sql.mock.calls.map((c) => (c[0] ?? []).join(' '));
const allBoundValues = () => sql.mock.calls.flatMap((c) => c.slice(1));

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

  // The DB session runs in UTC (confirmed live via `SHOW timezone`), so a bare `now()::date`
  // boundary is wrong for a negative-offset caller (e.g. Buenos Aires, UTC-3) for ~3 hours a
  // day. The client may pass its own local calendar date as `?today=`.
  describe('the today= boundary override', () => {
    it('uses the caller-supplied local date as the boundary, not now()::date', async () => {
      auth.mockResolvedValue(SESSION);
      sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await GET(req('?today=2026-07-31'));

      for (const text of allQueryTexts()) {
        expect(text).toContain('COALESCE(');
        expect(text).toContain('::date, now()::date)');
      }
      expect(allBoundValues()).toContain('2026-07-31');
    });

    it('falls back to now()::date when today= is absent (unchanged prior behavior)', async () => {
      auth.mockResolvedValue(SESSION);
      sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await GET(req());

      expect(allBoundValues()).toContain(null);
    });

    it.each(['not-a-date', '2026-13-40', '2026/07/31', ''])(
      'falls back to now()::date for an invalid today=%s (never lets an unvalidated value reach the query)',
      async (bad) => {
        auth.mockResolvedValue(SESSION);
        sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

        await GET(req(`?today=${encodeURIComponent(bad)}`));

        expect(allBoundValues()).toContain(null);
        expect(allBoundValues()).not.toContain(bad);
      },
    );
  });
});
