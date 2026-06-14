import { describe, it, expect, vi, beforeEach } from 'vitest';

// PATCH/DELETE /api/providers/[id]/locations/[locationId] — update and hard
// delete (owner|admin). The crux is CROSS-PROVIDER ISOLATION: writes are scoped
// by BOTH the path provider :id and the child locationId, so a locationId that
// belongs to a DIFFERENT provider matches no row (the mocked write resolves to
// []) → 404. auth(), `sql`, providerAuth are mocked at the module boundary.

import { PATCH, DELETE } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { requireProviderRole } from '@/app/api/utils/providerAuth';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => {
  const fn = vi.fn();
  fn.json = vi.fn((value) => ({ __jsonb: value }));
  return { default: fn };
});
vi.mock('@/app/api/utils/providerAuth', () => ({
  requireProviderRole: vi.fn(),
  ALL_PROVIDER_ROLES: ['owner', 'admin', 'staff', 'vet'],
}));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: '100', locationId: '5' } };

const forbidden = () =>
  Object.assign(new Error('Not authorized for this provider'), { status: 403 });

const queryTextOf = (callIndex) =>
  (sql.mock.calls[callIndex]?.[0] ?? []).join(' ');
const valuesOf = (callIndex) => sql.mock.calls[callIndex]?.slice(1) ?? [];

const patchReq = (body) =>
  new Request('http://localhost/api/providers/100/locations/5', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const deleteReq = () =>
  new Request('http://localhost/api/providers/100/locations/5', {
    method: 'DELETE',
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PATCH /api/providers/[id]/locations/[locationId]', () => {
  it('non-owner/admin → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockRejectedValue(forbidden());

    const res = await PATCH(patchReq({ name: 'Renamed' }), PARAMS);

    expect(res.status).toBe(403);
    expect(requireProviderRole).toHaveBeenCalledWith('100', 7);
  });

  it('owner → updates the location, scoped by id AND provider_id', async () => {
    auth.mockResolvedValue(SESSION);
    const UPDATED = { id: 5, provider_id: 100, name: 'Renamed' };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([UPDATED]); // update RETURNING
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await PATCH(patchReq({ name: 'Renamed' }), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ location: UPDATED });
    const text = queryTextOf(1);
    expect(text).toContain('UPDATE provider_locations');
    expect(text).toContain('AND provider_id =');
    // Both the child id and the provider id are bound.
    expect(valuesOf(1)).toEqual(expect.arrayContaining(['5', '100']));
  });

  it('cross-provider isolation: locationId belongs to a different provider → 404', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([]); // scoped UPDATE matches no row
    // Caller IS owner of the path provider (100) — authorization passes — but the
    // location row belongs to another provider, so the provider_id-scoped write
    // affects nothing.
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await PATCH(patchReq({ name: 'Hijack' }), PARAMS);

    expect(res.status).toBe(404);
  });

  it('hours_json is updated via sql.json — never a stringified string', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5, provider_id: 100 }]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const hours = { wed: ['10:00', '18:00'] };
    const res = await PATCH(patchReq({ hours_json: hours }), PARAMS);

    expect(res.status).toBe(200);
    expect(sql.json).toHaveBeenCalledTimes(1);
    const arg = sql.json.mock.calls[0][0];
    expect(arg).toEqual(hours);
    expect(typeof arg).not.toBe('string');
  });

  it('lat/lng out of range → 400, no write', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await PATCH(patchReq({ lng: -999 }), PARAMS);

    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(1); // profile lookup only
  });
});

describe('DELETE /api/providers/[id]/locations/[locationId]', () => {
  it('non-owner/admin → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockRejectedValue(forbidden());

    const res = await DELETE(deleteReq(), PARAMS);

    expect(res.status).toBe(403);
  });

  it('owner → hard deletes, scoped by id AND provider_id', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([{ id: 5 }]); // DELETE RETURNING id
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await DELETE(deleteReq(), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    const text = queryTextOf(1);
    expect(text).toContain('DELETE FROM provider_locations');
    expect(text).toContain('AND provider_id =');
    expect(valuesOf(1)).toEqual(expect.arrayContaining(['5', '100']));
  });

  it('cross-provider isolation: locationId belongs to a different provider → 404', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([]); // scoped DELETE matches no row
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await DELETE(deleteReq(), PARAMS);

    expect(res.status).toBe(404);
  });
});
