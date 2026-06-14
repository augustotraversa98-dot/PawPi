import { describe, it, expect, vi, beforeEach } from 'vitest';

// PATCH/DELETE /api/providers/[id]/services/[serviceId] — update and SOFT delete
// (owner|admin). DELETE sets active=false (it is an UPDATE, never a row delete)
// because vet_appointments.service_id references the row; PATCH active=true
// reactivates. Writes are scoped by BOTH path :id and serviceId, so a serviceId
// of a different provider matches no row → 404. auth(), `sql`, providerAuth mocked.

import { PATCH, DELETE } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { requireProviderRole } from '@/app/api/utils/providerAuth';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
vi.mock('@/app/api/utils/providerAuth', () => ({
  requireProviderRole: vi.fn(),
  ALL_PROVIDER_ROLES: ['owner', 'admin', 'staff', 'vet'],
}));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: '100', serviceId: '9' } };

const forbidden = () =>
  Object.assign(new Error('Not authorized for this provider'), { status: 403 });

const queryTextOf = (callIndex) =>
  (sql.mock.calls[callIndex]?.[0] ?? []).join(' ');
const valuesOf = (callIndex) => sql.mock.calls[callIndex]?.slice(1) ?? [];

const patchReq = (body) =>
  new Request('http://localhost/api/providers/100/services/9', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const deleteReq = () =>
  new Request('http://localhost/api/providers/100/services/9', {
    method: 'DELETE',
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PATCH /api/providers/[id]/services/[serviceId]', () => {
  it('non-owner/admin → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockRejectedValue(forbidden());

    const res = await PATCH(patchReq({ name: 'Renamed' }), PARAMS);

    expect(res.status).toBe(403);
    expect(requireProviderRole).toHaveBeenCalledWith('100', 7);
  });

  it('negative price_cents → 400, no write', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await PATCH(patchReq({ price_cents: -10 }), PARAMS);

    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(1); // profile lookup only
  });

  it('owner → updates the service, scoped by id AND provider_id', async () => {
    auth.mockResolvedValue(SESSION);
    const UPDATED = { id: 9, provider_id: 100, name: 'Renamed' };
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([UPDATED]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await PATCH(patchReq({ name: 'Renamed' }), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ service: UPDATED });
    const text = queryTextOf(1);
    expect(text).toContain('UPDATE provider_services');
    expect(text).toContain('AND provider_id =');
    expect(valuesOf(1)).toEqual(expect.arrayContaining(['9', '100']));
  });

  it('PATCH active=true reactivates a soft-deleted service', async () => {
    auth.mockResolvedValue(SESSION);
    const REACTIVATED = { id: 9, provider_id: 100, active: true };
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([REACTIVATED]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await PATCH(patchReq({ active: true }), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ service: REACTIVATED });
    // The explicit true is bound (not dropped) so COALESCE writes it.
    expect(valuesOf(1)).toContain(true);
  });

  it('cross-provider isolation: serviceId belongs to a different provider → 404', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([]); // scoped UPDATE matches no row
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await PATCH(patchReq({ name: 'Hijack' }), PARAMS);

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/providers/[id]/services/[serviceId] — soft delete', () => {
  it('non-owner/admin → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockRejectedValue(forbidden());

    const res = await DELETE(deleteReq(), PARAMS);

    expect(res.status).toBe(403);
  });

  it('owner → SOFT deletes: an UPDATE active=false, never a row delete', async () => {
    auth.mockResolvedValue(SESSION);
    const SOFT_DELETED = { id: 9, provider_id: 100, active: false };
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([SOFT_DELETED]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await DELETE(deleteReq(), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ service: SOFT_DELETED });
    const text = queryTextOf(1);
    // Proof it's a soft delete: an UPDATE setting active=false, NOT a row delete.
    expect(text).toContain('UPDATE provider_services');
    expect(text).toContain('active = false');
    expect(text).not.toContain('DELETE FROM');
    // Scoped by both ids.
    expect(valuesOf(1)).toEqual(expect.arrayContaining(['9', '100']));
  });

  it('cross-provider isolation: serviceId belongs to a different provider → 404', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([]); // scoped UPDATE matches no row
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await DELETE(deleteReq(), PARAMS);

    expect(res.status).toBe(404);
  });
});
