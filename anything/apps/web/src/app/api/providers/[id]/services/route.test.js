import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET/POST /api/providers/[id]/services — list (any active staff) and create
// (owner|admin). The list returns ALL services (active + inactive). Create
// requires `name` and validates money/duration. auth(), `sql`, providerAuth are
// mocked at the module boundary.

import { GET, POST } from './route';
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
const PARAMS = { params: { id: '100' } };

const forbidden = () =>
  Object.assign(new Error('Not authorized for this provider'), { status: 403 });

const queryTextOf = (callIndex) =>
  (sql.mock.calls[callIndex]?.[0] ?? []).join(' ');
const valuesOf = (callIndex) => sql.mock.calls[callIndex]?.slice(1) ?? [];

const postReq = (body) =>
  new Request('http://localhost/api/providers/100/services', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/providers/[id]/services', () => {
  it('non-staff → 403, checked with the read-all role set', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockRejectedValue(forbidden());

    const res = await GET(
      new Request('http://localhost/api/providers/100/services'),
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

  it('active staff → returns ALL of this provider’s services (active + inactive)', async () => {
    auth.mockResolvedValue(SESSION);
    const SERVICES = [
      { id: 1, provider_id: 100, name: 'Checkup', active: true },
      { id: 2, provider_id: 100, name: 'Old', active: false },
    ];
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce(SERVICES); // services list
    requireProviderRole.mockResolvedValue({ id: 1, role: 'vet' });

    const res = await GET(
      new Request('http://localhost/api/providers/100/services'),
      PARAMS,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ services: SERVICES });
    // No active filter — discovery filtering is ticket 5.
    expect(queryTextOf(1)).not.toContain('active =');
    expect(valuesOf(1)).toContain('100');
  });
});

describe('POST /api/providers/[id]/services — create', () => {
  it('non-owner/admin → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockRejectedValue(forbidden());

    const res = await POST(postReq({ name: 'Checkup' }), PARAMS);

    expect(res.status).toBe(403);
    expect(requireProviderRole).toHaveBeenCalledWith('100', 7);
  });

  it('missing name → 400, no insert', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await POST(postReq({ price_cents: 100 }), PARAMS);

    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(1); // profile lookup only
  });

  it('negative price_cents → 400', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await POST(postReq({ name: 'Checkup', price_cents: -5 }), PARAMS);

    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('negative deposit_cents → 400', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await POST(
      postReq({ name: 'Checkup', deposit_cents: -1 }),
      PARAMS,
    );

    expect(res.status).toBe(400);
  });

  it('non-positive duration_min → 400', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await POST(
      postReq({ name: 'Checkup', duration_min: 0 }),
      PARAMS,
    );

    expect(res.status).toBe(400);
  });

  it('owner → creates the service; active defaults true and provider is scoped', async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = { id: 9, provider_id: 100, name: 'Checkup', active: true };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([CREATED]); // insert
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await POST(
      postReq({ name: 'Checkup', price_cents: 5000, duration_min: 30 }),
      PARAMS,
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ service: CREATED });
    // active not supplied → defaults true (bound value), scoped to provider 100.
    const values = valuesOf(1);
    expect(values).toContain('100');
    expect(values).toContain(true);
  });

  it('persists image_urls on create (ticket 2.23)', async () => {
    auth.mockResolvedValue(SESSION);
    const IMAGES = ['https://x/a.png', 'https://x/b.png'];
    const CREATED = { id: 9, provider_id: 100, name: 'Checkup', image_urls: IMAGES };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([CREATED]); // insert
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await POST(
      postReq({ name: 'Checkup', image_urls: IMAGES }),
      PARAMS,
    );

    expect(res.status).toBe(201);
    expect(queryTextOf(1)).toContain('image_urls');
    // The exact array is bound as a single parameter.
    expect(valuesOf(1)).toEqual(expect.arrayContaining([IMAGES]));
  });

  it('persists payment_policy on create; defaults to none when omitted', async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = { id: 9, provider_id: 100, name: 'Grooming', payment_policy: 'full' };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([CREATED]); // insert
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await POST(
      postReq({ name: 'Grooming', price_cents: 5000, payment_policy: 'full' }),
      PARAMS,
    );

    expect(res.status).toBe(201);
    expect(queryTextOf(1)).toContain('payment_policy');
    expect(valuesOf(1)).toContain('full');
  });

  it('defaults payment_policy to none when omitted', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 9 }]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    await POST(postReq({ name: 'Checkup' }), PARAMS);
    expect(valuesOf(1)).toContain('none');
  });

  it('rejects an unknown payment_policy with 400, no insert', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await POST(
      postReq({ name: 'Checkup', payment_policy: 'later' }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    // only the profile lookup ran; no insert
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-array image_urls with 400, no insert (ticket 2.23)', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

    const res = await POST(
      postReq({ name: 'Checkup', image_urls: 'not-an-array' }),
      PARAMS,
    );

    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(1); // profile lookup only
  });
});
