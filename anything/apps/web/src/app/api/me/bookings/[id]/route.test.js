import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/me/bookings/[id] — the OWNER's single booking detail (booking summary screen). An
// owner-scoped read (WHERE owner_user_id = me), never requireProviderRole; another owner's id
// matches no row → 404. auth() + `sql` + resolveUserId are mocked at the module boundary, like
// /api/me/bookings. Asserts anon→401, no-profile→404, owner-scoping + the payment(approved)
// join, amount present when approved, `paid: null` when unpaid, and 404 for another owner.

import { GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { resolveUserId } from '@/app/api/utils/currentUser';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
vi.mock('@/app/api/utils/currentUser', () => ({ resolveUserId: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const ctx = (id = 'bk-1') => ({ params: { id } });
const req = () => new Request('http://localhost/api/me/bookings/bk-1');
const queryText = () => (sql.mock.calls[0]?.[0] ?? []).join(' ');
const boundValues = () => sql.mock.calls.flatMap((c) => c.slice(1));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
});

describe('GET /api/me/bookings/[id]', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('404 when the caller has no profile', async () => {
    auth.mockResolvedValue(SESSION);
    resolveUserId.mockResolvedValueOnce(null);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(404);
  });

  it('returns the owner-scoped detail; scopes by owner_user_id + booking id and joins the approved payment', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([
      {
        id: 'bk-1',
        pet_id: 3,
        provider_id: 9,
        title: 'Checkup',
        appointment_date: '2026-01-01',
        appointment_time: '10:00',
        booking_status: 'completed',
        status: 'completed',
        capability: 'vet',
        service_id: 5,
        notes: 'Vaccines updated',
        pet_name: 'Rex',
        provider_name: 'Vet A',
        provider_slug: 'vet-a',
        service_name: 'Wellness exam',
        paid_amount_cents: 10000,
        paid_currency: 'ARS',
      },
    ]);

    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    // Settled payment surfaces as a nested { amount_cents, currency }.
    expect(body.booking.paid).toEqual({ amount_cents: 10000, currency: 'ARS' });
    // The raw payment columns are not leaked flat.
    expect(body.booking.paid_amount_cents).toBeUndefined();
    expect(body.booking.notes).toBe('Vaccines updated');
    expect(body.booking.service_name).toBe('Wellness exam');

    const text = queryText();
    expect(text).toContain('FROM vet_appointments');
    expect(text).toContain('va.owner_user_id =');
    expect(text).toContain('deleted_at IS NULL');
    expect(text).toContain("pmt.status = 'approved'");
    expect(text).toContain('FROM payments pmt');
    // owner id (7) AND the booking id are both bound.
    expect(boundValues()).toContain(7);
    expect(boundValues()).toContain('bk-1');
  });

  it('paid is null when there is no settled (approved) payment', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([
      {
        id: 'bk-1',
        status: 'confirmed',
        provider_id: 9,
        paid_amount_cents: null,
        paid_currency: null,
      },
    ]);

    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).booking.paid).toBeNull();
  });

  it("404 when the booking belongs to another owner (no row matches the owner scope)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // owner scope filters it out
    const res = await GET(req(), ctx());
    expect(res.status).toBe(404);
    expect(boundValues()).toContain(7); // scoped to the caller, not the owner of the row
  });

  it("returns the provider's PRIMARY location nested as `location` (via the LATERAL join)", async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([
      {
        id: 'bk-1',
        provider_id: 9,
        status: 'confirmed',
        location_id: 5,
        location_name: 'Main Clinic',
        location_address: '123 Main St',
        location_hours_json: { mon: '09:00-17:00' },
        location_lat: '-34.6',
        location_lng: '-58.4',
        paid_amount_cents: null,
        paid_currency: null,
      },
    ]);

    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.booking.location).toEqual({
      name: 'Main Clinic',
      address: '123 Main St',
      hours_json: { mon: '09:00-17:00' },
      lat: -34.6, // coerced from the numeric string
      lng: -58.4,
    });
    // The raw location_* columns are not leaked flat.
    expect(body.booking.location_id).toBeUndefined();
    expect(body.booking.location_lat).toBeUndefined();

    const text = queryText();
    expect(text).toContain('LEFT JOIN LATERAL');
    expect(text).toContain('FROM provider_locations pl');
    expect(text).toContain('ORDER BY pl.id ASC');
  });

  it('location is null when the provider has no location row', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([
      { id: 'bk-1', provider_id: 9, status: 'confirmed', location_id: null, paid_amount_cents: null },
    ]);
    const res = await GET(req(), ctx());
    expect((await res.json()).booking.location).toBeNull();
  });
});
