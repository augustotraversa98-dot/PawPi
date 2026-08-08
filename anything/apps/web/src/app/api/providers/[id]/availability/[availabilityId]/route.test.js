import { describe, it, expect, vi, beforeEach } from 'vitest';

// PATCH/DELETE /api/providers/[id]/availability/[availabilityId] — the extranet editor's
// per-window mutations (owner|admin). PATCH validates the merged result (partial edit can't
// produce end<=start) and is scoped by id AND provider_id (cross-provider -> 404). DELETE is a
// hard delete, same scoping. auth() and `sql` are mocked; resolveUserId / requireProviderRole
// run for real against the mocked sql.

import { PATCH, DELETE } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const ACTIVE_ADMIN = { id: 1, role: 'admin', status: 'active' };
const PARAMS = { params: { id: '100', availabilityId: '5' } };
const EXISTING = {
  weekday: 0,
  start_time: '09:00:00',
  end_time: '18:00:00',
  slot_minutes: 30,
  active: true,
};

const patchReq = (body) =>
  new Request('http://localhost/api/providers/100/availability/5', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const delReq = () =>
  new Request('http://localhost/api/providers/100/availability/5', {
    method: 'DELETE',
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PATCH availability window', () => {
  it('non-admin → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([]); // no owner|admin membership
    const res = await PATCH(patchReq({ slot_minutes: 60 }), PARAMS);
    expect(res.status).toBe(403);
  });

  it('unknown / cross-provider window → 404 (scoped by id AND provider_id)', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([ACTIVE_ADMIN])
      .mockResolvedValueOnce([]); // no matching row for (id, provider_id)
    const res = await PATCH(patchReq({ slot_minutes: 60 }), PARAMS);
    expect(res.status).toBe(404);
  });

  it('bad weekday → 400, no update', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([ACTIVE_ADMIN])
      .mockResolvedValueOnce([EXISTING]);
    const res = await PATCH(patchReq({ weekday: 9 }), PARAMS);
    expect(res.status).toBe(400);
    // profile + membership + existing-row read = 3 calls; no UPDATE.
    expect(sql).toHaveBeenCalledTimes(3);
  });

  it('non-positive slot_minutes → 400', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([ACTIVE_ADMIN])
      .mockResolvedValueOnce([EXISTING]);
    const res = await PATCH(patchReq({ slot_minutes: 0 }), PARAMS);
    expect(res.status).toBe(400);
  });

  it('oversized slot_minutes → 400', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([ACTIVE_ADMIN])
      .mockResolvedValueOnce([EXISTING]);
    const res = await PATCH(patchReq({ slot_minutes: 5000 }), PARAMS);
    expect(res.status).toBe(400);
  });

  it('partial edit that makes end_time <= start_time → 400 (merged-result validation)', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([ACTIVE_ADMIN])
      .mockResolvedValueOnce([EXISTING]); // stored 09:00–18:00
    // Only end_time provided, earlier than the stored start_time.
    const res = await PATCH(patchReq({ end_time: '08:00' }), PARAMS);
    expect(res.status).toBe(400);
  });

  it('happy path: edits the window and returns it', async () => {
    auth.mockResolvedValue(SESSION);
    const UPDATED = { id: 5, weekday: 0, start_time: '10:00:00', end_time: '16:00:00', slot_minutes: 60, active: true };
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([ACTIVE_ADMIN])
      .mockResolvedValueOnce([EXISTING])
      .mockResolvedValueOnce([UPDATED]); // UPDATE ... RETURNING
    const res = await PATCH(
      patchReq({ start_time: '10:00', end_time: '16:00', slot_minutes: 60 }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ availability: UPDATED });
  });

  it('can toggle a window off via active=false', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([ACTIVE_ADMIN])
      .mockResolvedValueOnce([EXISTING])
      .mockResolvedValueOnce([{ id: 5, active: false }]);
    const res = await PATCH(patchReq({ active: false }), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).availability.active).toBe(false);
  });
});

describe('DELETE availability window', () => {
  it('non-admin → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([]); // no membership
    const res = await DELETE(delReq(), PARAMS);
    expect(res.status).toBe(403);
  });

  it('unknown / cross-provider window → 404', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([ACTIVE_ADMIN])
      .mockResolvedValueOnce([]); // DELETE ... RETURNING matched nothing
    const res = await DELETE(delReq(), PARAMS);
    expect(res.status).toBe(404);
  });

  it('happy path: hard-deletes the window', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([ACTIVE_ADMIN])
      .mockResolvedValueOnce([{ id: 5 }]); // deleted row
    const res = await DELETE(delReq(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
