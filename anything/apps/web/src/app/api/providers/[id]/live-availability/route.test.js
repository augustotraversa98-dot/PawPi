import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET/PUT /api/providers/[id]/live-availability — the walker "Accepting walks now" live flag
// (Ticket B1). GET reads (availability = flag AND not expired, evaluated in SQL); PUT upserts for
// active walker staff (8h auto-expiry on, cleared off). auth(), `sql`, providerAuth are mocked at
// the module boundary. Degrade-clean (table absent → accepting:false) is covered too.

import { GET, PUT } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import {
  requireProviderCapability,
  requireProviderRole,
  ProviderAuthError,
} from '@/app/api/utils/providerAuth';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
vi.mock('@/app/api/utils/providerAuth', () => {
  class MockProviderAuthError extends Error {
    constructor(message) {
      super(message);
      this.name = 'ProviderAuthError';
      this.status = 403;
    }
  }
  return {
    requireProviderCapability: vi.fn(),
    requireProviderRole: vi.fn(),
    ProviderAuthError: MockProviderAuthError,
    ALL_PROVIDER_ROLES: ['owner', 'admin', 'staff', 'vet'],
  };
});

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: '100' } };

const queryTextOf = (callIndex) =>
  (sql.mock.calls[callIndex]?.[0] ?? []).join(' ');
const valuesOf = (callIndex) => sql.mock.calls[callIndex]?.slice(1) ?? [];

const getReq = () =>
  new Request('http://localhost/api/providers/100/live-availability');
const putReq = (body) =>
  new Request('http://localhost/api/providers/100/live-availability', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/providers/[id]/live-availability', () => {
  it('401 for a guest', async () => {
    auth.mockResolvedValue(null);
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('404 (before any SQL) for a non-integer provider id', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await GET(getReq(), { params: { id: 'reorder' } });
    expect(res.status).toBe(404);
    expect(sql).not.toHaveBeenCalled();
  });

  it('no row → accepting:false', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([]); // live-availability read
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepting: false, expires_at: null });
  });

  it('an available row → accepting:true + expires_at', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ accepting: true, expires_at: '2026-08-13T20:00:00Z' }]);
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      accepting: true,
      expires_at: '2026-08-13T20:00:00Z',
    });
    // Expiry is evaluated in SQL, not by a cron.
    expect(queryTextOf(1)).toContain('expires_at > now()');
  });

  it('an expired row → accepting:false, expiry hidden', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ accepting: false, expires_at: '2020-01-01T00:00:00Z' }]);
    const res = await GET(getReq(), PARAMS);
    expect(await res.json()).toEqual({ accepting: false, expires_at: null });
  });

  it('degrades clean when the table is absent (unmigrated prod) → accepting:false, no 500', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockRejectedValueOnce(
      Object.assign(new Error('relation "provider_live_availability" does not exist'), {
        code: '42P01',
      }),
    );
    const res = await GET(getReq(), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepting: false, expires_at: null });
  });
});

describe('PUT /api/providers/[id]/live-availability', () => {
  it('404 (before any SQL/gate) for a non-integer provider id', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await PUT(putReq({ accepting: true }), { params: { id: 'reorder' } });
    expect(res.status).toBe(404);
    expect(sql).not.toHaveBeenCalled();
    expect(requireProviderCapability).not.toHaveBeenCalled();
  });

  it('403 for a non-walker provider (capability gate)', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderCapability.mockRejectedValue(
      new ProviderAuthError("Provider does not have the 'walker' capability"),
    );
    const res = await PUT(putReq({ accepting: true }), PARAMS);
    expect(res.status).toBe(403);
    expect(requireProviderCapability).toHaveBeenCalledWith('100', 'walker');
  });

  it('turning ON stamps an 8h expiry and binds coords; any active staff role allowed', async () => {
    auth.mockResolvedValue(SESSION);
    requireProviderCapability.mockResolvedValue(undefined);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'staff' });
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([{ accepting: true, expires_at: '2026-08-13T20:00:00Z' }]); // upsert
    const res = await PUT(putReq({ accepting: true, lat: -34.6, lng: -58.4 }), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      accepting: true,
      expires_at: '2026-08-13T20:00:00Z',
    });
    // Active-staff gate uses the full role set (not admin-only).
    expect(requireProviderRole).toHaveBeenCalledWith('100', 7, [
      'owner',
      'admin',
      'staff',
      'vet',
    ]);
    expect(queryTextOf(1)).toContain("interval '8 hours'");
    const values = valuesOf(1);
    expect(values).toContain(-34.6);
    expect(values).toContain(-58.4);
  });

  it('turning OFF clears coords (binds null lat/lng) and reports accepting:false', async () => {
    auth.mockResolvedValue(SESSION);
    requireProviderCapability.mockResolvedValue(undefined);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ accepting: false, expires_at: null }]);
    const res = await PUT(putReq({ accepting: false, lat: -34.6, lng: -58.4 }), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepting: false, expires_at: null });
    // Coords are dropped when turning off — both bound as null.
    const values = valuesOf(1);
    expect(values).not.toContain(-34.6);
  });

  it('degrades clean when the table is absent → accepting:false, no 500', async () => {
    auth.mockResolvedValue(SESSION);
    requireProviderCapability.mockResolvedValue(undefined);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });
    sql.mockResolvedValueOnce([PROFILE_ROW]).mockRejectedValueOnce(
      Object.assign(new Error('relation "provider_live_availability" does not exist'), {
        code: '42P01',
      }),
    );
    const res = await PUT(putReq({ accepting: true }), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepting: false, expires_at: null });
  });
});
