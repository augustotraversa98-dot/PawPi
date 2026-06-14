import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/vet-appointments — owner-scoped appointment list. Ticket 6a extends the
// SELECT column list (additive) to surface the booking columns 0016 added so the
// owner's existing appointments view can show booking state. This test pins that
// the new columns ARE selected and that the scope/ordering is otherwise unchanged.
// auth() and `sql` are mocked at the module boundary.

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };

// call 1 = the appointments SELECT (call 0 is the inline user_profile lookup).
const selectText = () => (sql.mock.calls[1]?.[0] ?? []).join(' ');
const selectValues = () => sql.mock.calls[1]?.slice(1) ?? [];

const getReq = (petId) =>
  new Request(`http://localhost/api/vet-appointments?petId=${petId}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/vet-appointments', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await GET(getReq(5));
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('400 when petId missing', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await GET(new Request('http://localhost/api/vet-appointments'));
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it('selects the new booking columns and keeps owner+pet scope, deleted filter, ordering', async () => {
    auth.mockResolvedValue(SESSION);
    const APPTS = [
      { id: 1, pet_id: 5, booking_status: 'requested', provider_id: 100 },
    ];
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // user_profile lookup
      .mockResolvedValueOnce(APPTS); // appointments select

    const res = await GET(getReq(5));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ appointments: APPTS });

    const text = selectText();
    // New columns are selected (additive).
    for (const col of [
      'provider_id',
      'provider_location_id',
      'service_id',
      'staff_user_id',
      'booking_status',
      'source',
    ]) {
      expect(text).toContain(col);
    }
    // Scope/behavior unchanged: owner + pet scoped, non-deleted, same ordering.
    expect(text).toContain('owner_user_id =');
    expect(text).toContain('pet_id =');
    expect(text).toContain('deleted_at IS NULL');
    expect(text).toContain('ORDER BY appointment_date ASC, appointment_time ASC');

    // Bound to this pet and the resolved owner id.
    const values = selectValues();
    expect(values).toContain('5'); // petId from query string
    expect(values).toContain(7); // owner_user_id resolved from profile
  });
});
