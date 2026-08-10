import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET/POST /api/providers/[id]/availability — generalized booking (2.4).
// GET = owner-facing OPEN-slot read for a PUBLISHED provider (public read; resolveUserId
// runs but provider membership is NOT required). POST = owner|admin sets a window.
// auth() and `sql` are mocked at the module boundary; resolveUserId / requireProviderRole
// run for real against the mocked sql.

import { GET, POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const ACTIVE_ADMIN = { id: 1, role: 'admin', status: 'active' };
const PARAMS = { params: { id: '100' } };

const getReq = (qs) =>
  new Request(`http://localhost/api/providers/100/availability?${qs}`, {
    method: 'GET',
  });
const postReq = (body) =>
  new Request('http://localhost/api/providers/100/availability', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET availability', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await GET(getReq('from=2026-06-15'), PARAMS);
    expect(res.status).toBe(401);
  });

  it('draft/unknown provider → 404', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([{ id: 100, status: 'draft' }]); // provider not published
    const res = await GET(getReq('from=2026-06-15'), PARAMS);
    expect(res.status).toBe(404);
  });

  it('missing from → 400', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 100, status: 'published' }]);
    const res = await GET(getReq('to=2026-06-15'), PARAMS);
    expect(res.status).toBe(400);
  });

  it('computes open slots (in the provider zone) minus taken bookings', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      // provider published, Buenos Aires zone (window times are local; 09:00 BA = 12:00 UTC)
      .mockResolvedValueOnce([
        { id: 100, status: 'published', time_zone: 'America/Argentina/Buenos_Aires' },
      ])
      // windows: Monday 09:00–11:00 hourly (BA local)
      .mockResolvedValueOnce([
        { weekday: 0, start_time: '09:00', end_time: '11:00', slot_minutes: 60, staff_user_id: null, capability: null },
      ])
      // taken: the 09:00 BA (= 12:00 UTC) slot is booked
      .mockResolvedValueOnce([
        { start: '2026-06-15T12:00:00.000Z', end: '2026-06-15T13:00:00.000Z' },
      ]);

    // 2026-06-15 is a Monday.
    const res = await GET(getReq('from=2026-06-15&to=2026-06-15'), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.time_zone).toBe('America/Argentina/Buenos_Aires');
    expect(body.availability).toHaveLength(1);
    expect(body.availability[0].date).toBe('2026-06-15');
    // 09:00 BA taken → only 10:00 BA (= 13:00 UTC) open
    expect(body.availability[0].slots).toEqual([
      { start: '2026-06-15T13:00:00.000Z', end: '2026-06-15T14:00:00.000Z' },
    ]);
  });

  it('service_id → slots at the service duration (60-min service over a 30-min window)', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([
        { id: 100, status: 'published', time_zone: 'America/Argentina/Buenos_Aires' },
      ])
      // window: Monday 09:00–11:00 @ 30-min (BA local)
      .mockResolvedValueOnce([
        { weekday: 0, start_time: '09:00', end_time: '11:00', slot_minutes: 30, staff_user_id: null, capability: null },
      ])
      .mockResolvedValueOnce([{ duration_min: 60 }]) // service duration lookup
      .mockResolvedValueOnce([]); // no taken
    const res = await GET(getReq('from=2026-06-15&to=2026-06-15&service_id=5'), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    // 60-min service → hourly slots (09:00/10:00 BA = 12:00/13:00 UTC), NOT the 30-min grid.
    expect(body.availability[0].slots).toEqual([
      { start: '2026-06-15T12:00:00.000Z', end: '2026-06-15T13:00:00.000Z' },
      { start: '2026-06-15T13:00:00.000Z', end: '2026-06-15T14:00:00.000Z' },
    ]);
  });

  it('no service_id → keeps the window slot_minutes grid (backward-compatible)', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([
        { id: 100, status: 'published', time_zone: 'America/Argentina/Buenos_Aires' },
      ])
      .mockResolvedValueOnce([
        { weekday: 0, start_time: '09:00', end_time: '11:00', slot_minutes: 30, staff_user_id: null, capability: null },
      ])
      .mockResolvedValueOnce([]); // no taken (no service lookup happens without service_id)
    const res = await GET(getReq('from=2026-06-15&to=2026-06-15'), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    // 30-min window → four half-hour slots.
    expect(body.availability[0].slots.map((s) => s.start)).toEqual([
      '2026-06-15T12:00:00.000Z',
      '2026-06-15T12:30:00.000Z',
      '2026-06-15T13:00:00.000Z',
      '2026-06-15T13:30:00.000Z',
    ]);
  });

  it('no windows → empty slots (empty state, no fake data)', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 100, status: 'published' }])
      .mockResolvedValueOnce([]) // no windows
      .mockResolvedValueOnce([]); // no taken
    const res = await GET(getReq('from=2026-06-15'), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.availability[0].slots).toEqual([]);
  });
});

describe('POST availability', () => {
  it('non-admin → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([]); // no owner|admin membership
    const res = await POST(
      postReq({ weekday: 0, start_time: '09:00', end_time: '17:00' }),
      PARAMS,
    );
    expect(res.status).toBe(403);
  });

  it('bad weekday → 400', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([ACTIVE_ADMIN]);
    const res = await POST(
      postReq({ weekday: 9, start_time: '09:00', end_time: '17:00' }),
      PARAMS,
    );
    expect(res.status).toBe(400);
  });

  it('end_time before start_time → 400', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([ACTIVE_ADMIN]);
    const res = await POST(
      postReq({ weekday: 0, start_time: '17:00', end_time: '09:00' }),
      PARAMS,
    );
    expect(res.status).toBe(400);
  });

  it('non-positive slot_minutes → 400, no insert', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([ACTIVE_ADMIN]);
    const res = await POST(
      postReq({ weekday: 0, start_time: '09:00', end_time: '17:00', slot_minutes: 0 }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    // profile + membership only; no INSERT.
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it('oversized slot_minutes → 400', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([ACTIVE_ADMIN]);
    const res = await POST(
      postReq({ weekday: 0, start_time: '09:00', end_time: '17:00', slot_minutes: 5000 }),
      PARAMS,
    );
    expect(res.status).toBe(400);
  });

  it('happy path: inserts a window', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([ACTIVE_ADMIN])
      .mockResolvedValueOnce([{ id: 3, weekday: 0 }]); // insert
    const res = await POST(
      postReq({ weekday: 0, start_time: '09:00', end_time: '17:00', slot_minutes: 30 }),
      PARAMS,
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ availability: { id: 3, weekday: 0 } });
  });
});
