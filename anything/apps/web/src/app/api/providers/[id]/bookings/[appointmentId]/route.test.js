import { describe, it, expect, vi, beforeEach } from 'vitest';

// PATCH /api/providers/[id]/bookings/[appointmentId] — confirm/decline/cancel/
// assign one booking. OPERATIONAL: ANY active staff (ALL_PROVIDER_ROLES). auth()
// and `sql` are mocked at the module boundary; resolveUserId and
// requireProviderRole run for real against the mocked sql. The sql call order per
// request is: 1) profile lookup, 2) membership, 3) load current booking,
// [4) assignee active-staff check], last) the UPDATE.

import { PATCH } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const ACTIVE_MEMBERSHIP = { id: 1, role: 'staff', status: 'active' };
const PARAMS = { params: { id: '100', appointmentId: '55' } };

const lastCall = () => sql.mock.calls[sql.mock.calls.length - 1];
const lastQueryText = () => (lastCall()?.[0] ?? []).join(' ');
const lastValues = () => lastCall()?.slice(1) ?? [];

const patchReq = (body) =>
  new Request('http://localhost/api/providers/100/bookings/55', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

// Standard auth+membership prefix; remaining args are the per-test sql results.
const arrange = (...rest) => {
  auth.mockResolvedValue(SESSION);
  sql
    .mockResolvedValueOnce([PROFILE_ROW]) // profile
    .mockResolvedValueOnce([ACTIVE_MEMBERSHIP]); // membership
  for (const r of rest) sql.mockResolvedValueOnce(r);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PATCH /api/providers/[id]/bookings/[appointmentId]', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await PATCH(patchReq({ action: 'confirm' }), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('non-staff → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([]); // no active membership

    const res = await PATCH(patchReq({ action: 'confirm' }), PARAMS);
    expect(res.status).toBe(403);
  });

  it('unknown action → 400, no booking load', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([ACTIVE_MEMBERSHIP]);

    const res = await PATCH(patchReq({ action: 'bogus' }), PARAMS);
    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(2); // never reached the booking load
  });

  it("another provider's appointment id → 404", async () => {
    arrange([]); // booking load: no row scoped to this provider
    const res = await PATCH(patchReq({ action: 'confirm' }), PARAMS);
    expect(res.status).toBe(404);
  });

  // ---- confirm ----
  it('confirm: requested → confirmed, reminder_enabled/status NOT written', async () => {
    arrange(
      [{ id: 55, booking_status: 'requested', status: 'scheduled' }], // load
      [{ id: 55, booking_status: 'confirmed' }], // update
    );

    const res = await PATCH(patchReq({ action: 'confirm' }), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      booking: { id: 55, booking_status: 'confirmed' },
    });

    const text = lastQueryText();
    expect(text).toContain('UPDATE vet_appointments');
    expect(text).toContain('booking_status');
    expect(lastValues()).toContain('confirmed');
    // CONFIRM must not touch the reminder engine or the lifecycle status column.
    expect(text).not.toContain('reminder_enabled');
    // No standalone `status` write (booking_status excluded from the check).
    expect(text.replace(/booking_status/g, '')).not.toContain('status');
    // Scoped to both ids (cross-provider isolation on the write).
    expect(lastValues()).toContain('55');
    expect(lastValues()).toContain('100');
  });

  it('confirm on a confirmed booking → 409', async () => {
    arrange([{ id: 55, booking_status: 'confirmed', status: 'scheduled' }]);
    const res = await PATCH(patchReq({ action: 'confirm' }), PARAMS);
    expect(res.status).toBe(409);
  });

  it('confirm + assign: assigns active staff while confirming', async () => {
    arrange(
      [{ id: 55, booking_status: 'requested', status: 'scheduled' }], // load
      [{ id: 2 }], // assignee is active staff
      [{ id: 55, booking_status: 'confirmed', staff_user_id: 8 }], // update
    );

    const res = await PATCH(
      patchReq({ action: 'confirm', staffUserId: 8 }),
      PARAMS,
    );
    expect(res.status).toBe(200);

    const text = lastQueryText();
    expect(text).toContain('booking_status');
    expect(text).toContain('staff_user_id');
    expect(lastValues()).toContain('confirmed');
    expect(lastValues()).toContain(8);
    expect(text).not.toContain('reminder_enabled');
  });

  // ---- decline ----
  it('decline: requested → declined sets status=cancelled AND reminder_enabled=false', async () => {
    arrange(
      [{ id: 55, booking_status: 'requested', status: 'scheduled' }], // load
      [{ id: 55, booking_status: 'declined' }], // update
    );

    const res = await PATCH(patchReq({ action: 'decline' }), PARAMS);
    expect(res.status).toBe(200);

    const text = lastQueryText();
    expect(text).toContain('booking_status');
    expect(text).toContain('status');
    expect(text).toContain('reminder_enabled');
    const values = lastValues();
    expect(values).toContain('declined'); // booking_status
    expect(values).toContain('cancelled'); // lifecycle status
    expect(values).toContain(false); // reminder_enabled
  });

  it('decline on a non-requested booking → 409', async () => {
    arrange([{ id: 55, booking_status: 'confirmed', status: 'scheduled' }]);
    const res = await PATCH(patchReq({ action: 'decline' }), PARAMS);
    expect(res.status).toBe(409);
  });

  // ---- cancel ----
  it('cancel: confirmed → cancelled sets status=cancelled + reminder_enabled=false', async () => {
    arrange(
      [{ id: 55, booking_status: 'confirmed', status: 'scheduled' }], // load
      [{ id: 55, booking_status: 'cancelled' }], // update
    );

    const res = await PATCH(patchReq({ action: 'cancel' }), PARAMS);
    expect(res.status).toBe(200);

    const values = lastValues();
    expect(values).toContain('cancelled'); // booking_status AND status both 'cancelled'
    expect(values).toContain(false); // reminder_enabled
    expect(lastQueryText()).toContain('reminder_enabled');
  });

  // ---- assign ----
  it('assign: sets staff_user_id when assignee is active staff', async () => {
    arrange(
      [{ id: 55, booking_status: 'requested', status: 'scheduled' }], // load
      [{ id: 2 }], // assignee active staff
      [{ id: 55, staff_user_id: 8 }], // update
    );

    const res = await PATCH(
      patchReq({ action: 'assign', staffUserId: 8 }),
      PARAMS,
    );
    expect(res.status).toBe(200);

    const text = lastQueryText();
    expect(text).toContain('staff_user_id');
    expect(lastValues()).toContain(8);
  });

  it('assign to a non-active-staff user → 400', async () => {
    arrange(
      [{ id: 55, booking_status: 'requested', status: 'scheduled' }], // load
      [], // assignee is NOT active staff of this provider
    );

    const res = await PATCH(
      patchReq({ action: 'assign', staffUserId: 999 }),
      PARAMS,
    );
    expect(res.status).toBe(400);
  });

  it('assign without staffUserId → 400', async () => {
    arrange([{ id: 55, booking_status: 'requested', status: 'scheduled' }]);
    const res = await PATCH(patchReq({ action: 'assign' }), PARAMS);
    expect(res.status).toBe(400);
  });

  it('assign on a cancelled booking → 409 (illegal transition)', async () => {
    arrange([{ id: 55, booking_status: 'cancelled', status: 'cancelled' }]);
    const res = await PATCH(
      patchReq({ action: 'assign', staffUserId: 8 }),
      PARAMS,
    );
    expect(res.status).toBe(409);
  });
});
