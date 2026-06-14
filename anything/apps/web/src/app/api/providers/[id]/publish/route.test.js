import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/providers/[id]/publish — flip status draft<->published, owner|admin
// only, value validated against the providers_status_check set. auth(), `sql`, and
// the providerAuth chokepoint are mocked at the module boundary.

import { POST } from './route';
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

const forbidden = () => Object.assign(new Error('Not authorized for this provider'), { status: 403 });

const pubReq = (body) =>
  new Request('http://localhost/api/providers/100/publish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

it('anonymous → 401', async () => {
  auth.mockResolvedValue(undefined);
  const res = await POST(pubReq({ status: 'published' }), PARAMS);
  expect(res.status).toBe(401);
  expect(sql).not.toHaveBeenCalled();
});

it('owner flips draft → published', async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce([PROFILE_ROW]); // profile lookup
  requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });
  sql.mockResolvedValueOnce([{ id: 100, status: 'published' }]); // UPDATE ... RETURNING

  const res = await POST(pubReq({ status: 'published' }), PARAMS);

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ provider: { id: 100, status: 'published' } });
  // owner|admin only (the default role set).
  expect(requireProviderRole).toHaveBeenCalledWith('100', 7);
});

it('non-owner/admin → 403, never writes', async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce([PROFILE_ROW]);
  requireProviderRole.mockRejectedValue(forbidden());

  const res = await POST(pubReq({ status: 'published' }), PARAMS);

  expect(res.status).toBe(403);
  // Only the profile lookup ran — no UPDATE.
  expect(sql).toHaveBeenCalledTimes(1);
});

it('invalid status value → 400, never writes', async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce([PROFILE_ROW]);
  requireProviderRole.mockResolvedValue({ id: 1, role: 'owner' });

  const res = await POST(pubReq({ status: 'archived' }), PARAMS);

  expect(res.status).toBe(400);
  expect(sql).toHaveBeenCalledTimes(1); // profile lookup only, no UPDATE
});

it('cross-provider isolation: staff of A publishing B → 403', async () => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce([PROFILE_ROW]);
  requireProviderRole.mockRejectedValue(forbidden());

  const res = await POST(pubReq({ status: 'published' }), PARAMS);

  expect(res.status).toBe(403);
  expect(sql).toHaveBeenCalledTimes(1);
});
