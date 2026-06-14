import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/providers/[id]/bookings — the provider's booking INBOX.
// OPERATIONAL read: ANY active staff (ALL_PROVIDER_ROLES). Returns this
// provider's non-deleted vet_appointments joined with booking CONTEXT ONLY (pet
// name, owner display name, service name) — NO medical tables. auth() and `sql`
// are mocked at the module boundary like the 4a–6a route tests; resolveUserId and
// requireProviderRole run for real against the mocked sql.

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const ACTIVE_MEMBERSHIP = { id: 1, role: 'staff', status: 'active' };
const PARAMS = { params: { id: '100' } };

// Last sql call = the inbox SELECT. Its query text + bound values let us assert
// the join/scoping shape.
const lastCall = () => sql.mock.calls[sql.mock.calls.length - 1];
const lastQueryText = () => (lastCall()?.[0] ?? []).join(' ');
const lastValues = () => lastCall()?.slice(1) ?? [];

const inboxReq = (query = '') =>
  new Request(`http://localhost/api/providers/100/bookings${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/providers/[id]/bookings', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await GET(inboxReq(), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('non-staff → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([]); // requireProviderRole: no active membership

    const res = await GET(inboxReq(), PARAMS);

    expect(res.status).toBe(403);
  });

  it('returns this provider non-deleted bookings with pet/owner/service context', async () => {
    auth.mockResolvedValue(SESSION);
    const ROWS = [
      {
        id: 9,
        pet_id: 5,
        owner_user_id: 7,
        booking_status: 'requested',
        status: 'scheduled',
        staff_user_id: null,
        pet_name: 'Rex',
        owner_name: 'Jane Doe',
        service_name: 'Annual Checkup',
      },
    ];
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([ACTIVE_MEMBERSHIP]) // membership
      .mockResolvedValueOnce(ROWS); // inbox SELECT

    const res = await GET(inboxReq(), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bookings: ROWS });

    const text = lastQueryText();
    expect(text).toContain('FROM vet_appointments');
    // Booking-context joins present.
    expect(text).toContain('pets');
    expect(text).toContain('user_profiles');
    expect(text).toContain('provider_services');
    expect(text).toContain('pet_name');
    expect(text).toContain('owner_name');
    expect(text).toContain('service_name');
    // Scoped to THIS provider + non-deleted, newest first.
    expect(text).toContain('va.provider_id =');
    expect(text).toContain('deleted_at IS NULL');
    expect(text).toContain('ORDER BY va.appointment_date DESC');
    expect(lastValues()).toContain('100'); // provider id from path
  });

  it('the SELECT touches NO medical tables', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([ACTIVE_MEMBERSHIP])
      .mockResolvedValueOnce([]);

    await GET(inboxReq(), PARAMS);

    const text = lastQueryText();
    expect(text).not.toContain('health_');
    expect(text).not.toContain('weight');
    expect(text).not.toContain('vaccinations');
    expect(text).not.toContain('vet_notes');
    expect(text).not.toContain('care_access');
  });

  it('?booking_status= filters by booking_status', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([ACTIVE_MEMBERSHIP])
      .mockResolvedValueOnce([]);

    await GET(inboxReq('?booking_status=requested'), PARAMS);

    const text = lastQueryText();
    expect(text).toContain('va.booking_status =');
    expect(lastValues()).toContain('requested'); // bound filter value
  });
});
