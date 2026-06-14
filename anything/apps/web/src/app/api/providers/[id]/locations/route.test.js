import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET/POST /api/providers/[id]/locations — list (any active staff) and create
// (owner|admin). auth(), `sql`, and the providerAuth chokepoint are mocked at the
// module boundary. requireProviderRole is the authorization gate: a rejection
// stands in for "not authorized" (no membership, wrong role, or staff of a
// different provider). hours_json is jsonb and MUST be bound via sql.json — the
// mock records its raw argument so the test can prove it isn't pre-stringified.

import { GET, POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { requireProviderRole } from '@/app/api/utils/providerAuth';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => {
  const fn = vi.fn();
  // sql.json(value) binds the RAW value to a jsonb param. Mirror that: wrap it so
  // a call is observable, and record the argument for the round-trip assertion.
  fn.json = vi.fn((value) => ({ __jsonb: value }));
  return { default: fn };
});
vi.mock('@/app/api/utils/providerAuth', () => ({
  requireProviderRole: vi.fn(),
  ALL_PROVIDER_ROLES: ['owner', 'admin', 'staff', 'vet'],
}));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { id: '100' } };

const forbidden = () =>
  Object.assign(new Error('Not authorized for this provider'), { status: 403 });

const postReq = (body) =>
  new Request('http://localhost/api/providers/100/locations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const valuesOf = (callIndex) => sql.mock.calls[callIndex]?.slice(1) ?? [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/providers/[id]/locations', () => {
  it('anonymous → 401, never touches the DB', async () => {
    auth.mockResolvedValue(undefined);
    const res = await GET(
      new Request('http://localhost/api/providers/100/locations'),
      PARAMS,
    );
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('non-staff → 403, checked with the read-all role set', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // profile lookup
    requireProviderRole.mockRejectedValue(forbidden());

    const res = await GET(
      new Request('http://localhost/api/providers/100/locations'),
      PARAMS,
    );

    expect(res.status).toBe(403);
    expect(requireProviderRole).toHaveBeenCalledWith('100', 7, [
      'owner',
      'admin',
      'staff',
      'vet',
    ]);
  });

  it('active staff → returns only this provider’s locations', async () => {
    auth.mockResolvedValue(SESSION);
    const LOCATIONS = [{ id: 1, provider_id: 100, name: 'Main' }];
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce(LOCATIONS); // locations list
    requireProviderRole.mockResolvedValue({ id: 1, role: 'staff' });

    const res = await GET(
      new Request('http://localhost/api/providers/100/locations'),
      PARAMS,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ locations: LOCATIONS });
    // Scoped to the path provider id.
    expect(valuesOf(1)).toContain('100');
  });
});

describe('POST /api/providers/[id]/locations — create', () => {
  it('non-owner/admin → 403, checked with the default (owner|admin) role set', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockRejectedValue(forbidden());

    const res = await POST(postReq({ name: 'Main' }), PARAMS);

    expect(res.status).toBe(403);
    expect(requireProviderRole).toHaveBeenCalledWith('100', 7);
  });

  it('owner → creates a location scoped to the provider', async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = { id: 5, provider_id: 100, name: 'Main' };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([CREATED]); // insert
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await POST(postReq({ name: 'Main', phone: '555' }), PARAMS);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ location: CREATED });
    // owner_user resolution is NOT the bound key — the provider id from the path
    // is, so the row can only ever attach to provider 100.
    expect(valuesOf(1)).toContain('100');
  });

  it('lat/lng out of range → 400, no insert', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await POST(postReq({ name: 'Main', lat: 999 }), PARAMS);

    expect(res.status).toBe(400);
    // Only the profile lookup ran; the insert never did.
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('hours_json round-trips as a real jsonb object via sql.json — not a stringified string', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([{ id: 5, provider_id: 100 }]); // insert
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const hours = { mon: ['09:00', '17:00'], tue: ['09:00', '17:00'] };
    const res = await POST(postReq({ name: 'Main', hours_json: hours }), PARAMS);

    expect(res.status).toBe(201);
    // sql.json was used to bind hours_json...
    expect(sql.json).toHaveBeenCalledTimes(1);
    // ...with the RAW object, never JSON.stringify'd.
    const arg = sql.json.mock.calls[0][0];
    expect(arg).toEqual(hours);
    expect(typeof arg).not.toBe('string');
    // And the wrapped jsonb param (not a string) is what got bound to the INSERT.
    expect(valuesOf(1)).toContainEqual({ __jsonb: hours });
  });

  it('no hours_json → sql.json is not called', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5 }]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await POST(postReq({ name: 'Main' }), PARAMS);

    expect(res.status).toBe(201);
    expect(sql.json).not.toHaveBeenCalled();
  });
});
