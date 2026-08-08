import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/providers/[id]/availability/windows — owner-facing RAW window read for the
// extranet editor. owner|admin only; returns provider-wide rows + a scoped_count of the
// per-staff/per-capability/per-location windows the editor does not manage. auth() and `sql`
// are mocked at the module boundary; resolveUserId / requireProviderRole run for real.

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const ACTIVE_ADMIN = { id: 1, role: 'admin', status: 'active' };
const PARAMS = { params: { id: '100' } };

const getReq = () =>
  new Request('http://localhost/api/providers/100/availability/windows', {
    method: 'GET',
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET availability/windows', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(401);
  });

  it('non-admin → 403 (no owner|admin membership)', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([]); // no owner|admin membership
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(403);
  });

  it('owner|admin → returns the provider-wide windows + scoped_count', async () => {
    auth.mockResolvedValue(SESSION);
    const WINDOWS = [
      { id: 1, weekday: 0, start_time: '09:00:00', end_time: '18:00:00', slot_minutes: 30, active: true },
      { id: 2, weekday: 1, start_time: '09:00:00', end_time: '18:00:00', slot_minutes: 30, active: true },
    ];
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([ACTIVE_ADMIN]) // requireProviderRole membership
      .mockResolvedValueOnce(WINDOWS) // provider-wide windows
      .mockResolvedValueOnce([{ count: 3 }]); // scoped (per-staff/cap/location) count

    const res = await GET(getReq(), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ windows: WINDOWS, scoped_count: 3 });

    // The window query is provider-wide-only and ordered by weekday, start_time.
    const windowQuery = sql.mock.calls[2][0].join(' ');
    expect(windowQuery).toContain('staff_user_id IS NULL');
    expect(windowQuery).toContain('capability IS NULL');
    expect(windowQuery).toContain('location_id IS NULL');
    expect(windowQuery).toContain('ORDER BY weekday');
  });
});
