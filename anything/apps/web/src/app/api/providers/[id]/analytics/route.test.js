import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/providers/[id]/analytics — the provider DASHBOARD HOME summary (ticket 2.14). A
// read-only aggregate over ONLY this provider's own rows (revenue/bookings/occupancy/rating/
// top services). auth() + `sql` mocked at the module boundary; resolveUserId + requireProviderRole
// run for real against the mocked sql (same pattern as the bookings inbox test). The key
// assertions: anon→401, non-staff→403, and EVERY aggregate query is scoped to this provider id
// (provider_id) — never an un-scoped cross-provider read.

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const ACTIVE_MEMBERSHIP = { id: 1, role: 'owner', status: 'active' };
const PARAMS = { params: { id: '100' } };
const req = () => new Request('http://localhost/api/providers/100/analytics');

// All sql query texts seen this call (each call is a tagged-template strings array first arg).
const allQueryTexts = () => sql.mock.calls.map((c) => (c[0] ?? []).join(' '));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/providers/[id]/analytics', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('non-staff → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([]); // requireProviderRole: no active membership
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(403);
  });

  it('returns the scoped summary shape for active staff', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([ACTIVE_MEMBERSHIP]) // requireProviderRole
      .mockResolvedValueOnce([{ total_cents: 15000, paid_order_count: 2 }]) // revenue total
      .mockResolvedValueOnce([{ month: '2026-06', revenue_cents: 15000, order_count: 2 }]) // revenue by month
      .mockResolvedValueOnce([{ currency: 'ARS', n: 2 }]) // currency
      .mockResolvedValueOnce([{ month: '2026-06', booking_count: 3 }]) // bookings by month
      .mockResolvedValueOnce([{ id: 9, pet_name: 'Rex', appointment_date: '2026-07-01' }]) // upcoming
      .mockResolvedValueOnce([{ total: 5, upcoming: 2 }]) // bookings total
      .mockResolvedValueOnce([{ on_site: 1, booked_ahead: 4 }]) // occupancy
      .mockResolvedValueOnce([{ review_count: 1, avg_rating: 4 }]) // rating
      .mockResolvedValueOnce([{ service_id: 100, service_name: 'Grooming', booking_count: 3 }]); // top services

    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.provider_id).toBe(100);
    expect(body.revenue).toMatchObject({
      total_cents: 15000,
      paid_order_count: 2,
      currency: 'ARS',
    });
    expect(body.revenue.by_month).toEqual([
      { month: '2026-06', revenue_cents: 15000, order_count: 2 },
    ]);
    expect(body.bookings).toMatchObject({ total: 5, upcoming_count: 2 });
    expect(body.bookings.upcoming).toHaveLength(1);
    expect(body.occupancy).toEqual({ on_site: 1, booked_ahead: 4 });
    expect(body.rating).toEqual({ review_count: 1, avg_rating: 4 });
    expect(body.top_services).toEqual([
      { service_id: 100, service_name: 'Grooming', booking_count: 3 },
    ]);
  });

  it('EVERY aggregate query is scoped to this provider id (no cross-provider read)', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([ACTIVE_MEMBERSHIP])
      .mockResolvedValue([]); // every aggregate returns empty
    const res = await GET(req(), PARAMS);
    expect(res.status).toBe(200);

    // The aggregate queries (calls after profile + membership) each filter by provider_id.
    const aggregates = allQueryTexts().slice(2);
    expect(aggregates.length).toBeGreaterThanOrEqual(7);
    for (const text of aggregates) {
      expect(text).toContain('provider_id =');
    }
    // The provider id from the path is bound as a value across the aggregates.
    const boundValues = sql.mock.calls.flatMap((c) => c.slice(1));
    expect(boundValues).toContain('100');
  });

  it('the summary tables are the existing RLS-scoped ones (no new BI tables)', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([ACTIVE_MEMBERSHIP])
      .mockResolvedValue([]);
    await GET(req(), PARAMS);
    const joined = allQueryTexts().join(' | ');
    expect(joined).toContain('FROM orders');
    expect(joined).toContain('FROM vet_appointments');
    expect(joined).toContain('FROM daycare_stays');
    expect(joined).toContain('FROM provider_reviews');
    expect(joined).toContain('provider_services');
  });

  it('empty data yields zeroed metrics + empty series (no fake values)', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([ACTIVE_MEMBERSHIP])
      .mockResolvedValue([]); // all aggregates empty
    const res = await GET(req(), PARAMS);
    const body = await res.json();
    expect(body.revenue.total_cents).toBe(0);
    expect(body.revenue.by_month).toEqual([]);
    expect(body.bookings.total).toBe(0);
    expect(body.bookings.upcoming).toEqual([]);
    expect(body.occupancy).toEqual({ on_site: 0, booked_ahead: 0 });
    expect(body.rating).toEqual({ review_count: 0, avg_rating: 0 });
    expect(body.top_services).toEqual([]);
  });
});
