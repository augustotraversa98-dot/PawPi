import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET/POST/DELETE /api/providers/[id]/capabilities — list / add / remove capabilities
// (ticket 2.1). auth(), `sql`, resolveUserId, and requireProviderRole are mocked at the
// module boundary. List is any active staff; add/remove are owner|admin (the default
// requireProviderRole gate). Every write validates against the allowed capability set.

import { GET, POST, DELETE } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';
import { resolveUserId } from '@/app/api/utils/currentUser';
import { requireProviderRole } from '@/app/api/utils/providerAuth';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));
vi.mock('@/app/api/utils/currentUser', () => ({ resolveUserId: vi.fn() }));
vi.mock('@/app/api/utils/providerAuth', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, requireProviderRole: vi.fn() };
});

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PARAMS = { params: { id: '100' } };
const queryTextOf = (i) => (sql.mock.calls[i]?.[0] ?? []).join(' ');

const jsonReq = (body, method = 'POST') =>
  new Request('http://localhost/api/providers/100/capabilities', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  resolveUserId.mockResolvedValue(7);
  requireProviderRole.mockResolvedValue({ role: 'owner', status: 'active' });
});

describe('GET /api/providers/[id]/capabilities', () => {
  it('anonymous → 401, no DB', async () => {
    auth.mockResolvedValue(undefined);
    const res = await GET(new Request('http://localhost/x'), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('returns the flat capability list for any active staff', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([{ capability: 'groomer' }, { capability: 'vet' }]);

    const res = await GET(new Request('http://localhost/x'), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ capabilities: ['groomer', 'vet'] });
    // Read path allows ALL roles (not just owner|admin).
    const [, rolesArg] = requireProviderRole.mock.calls[0];
    expect(requireProviderRole).toHaveBeenCalled();
  });
});

describe('POST /api/providers/[id]/capabilities — add', () => {
  it('anonymous → 401', async () => {
    auth.mockResolvedValue(undefined);
    const res = await POST(jsonReq({ capability: 'vet' }), PARAMS);
    expect(res.status).toBe(401);
  });

  it('403 when the caller is not owner|admin', async () => {
    auth.mockResolvedValue(SESSION);
    requireProviderRole.mockRejectedValueOnce(
      Object.assign(new Error('Not authorized for this provider'), { status: 403 }),
    );
    const res = await POST(jsonReq({ capability: 'vet' }), PARAMS);
    expect(res.status).toBe(403);
  });

  it('missing capability → 400', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(jsonReq({}), PARAMS);
    expect(res.status).toBe(400);
  });

  it('invalid capability → 400 (never hits the DB CHECK)', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await POST(jsonReq({ capability: 'wizardry' }), PARAMS);
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it('adds a valid capability (idempotent ON CONFLICT) and returns the new list', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([]) // 1: INSERT ... ON CONFLICT DO NOTHING
      .mockResolvedValueOnce([{ capability: 'groomer' }, { capability: 'vet' }]); // 2: re-list

    const res = await POST(jsonReq({ capability: 'groomer' }), PARAMS);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ capabilities: ['groomer', 'vet'] });
    expect(queryTextOf(0)).toContain('INSERT INTO provider_capabilities');
    expect(queryTextOf(0)).toContain('ON CONFLICT');
    // provider_id (100) + capability bound as params.
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(['100', 'groomer']));
  });
});

describe('DELETE /api/providers/[id]/capabilities — remove', () => {
  const delReq = (cap) =>
    new Request(
      `http://localhost/api/providers/100/capabilities${cap ? `?capability=${cap}` : ''}`,
      { method: 'DELETE' },
    );

  it('403 when not owner|admin', async () => {
    auth.mockResolvedValue(SESSION);
    requireProviderRole.mockRejectedValueOnce(
      Object.assign(new Error('Not authorized for this provider'), { status: 403 }),
    );
    const res = await DELETE(delReq('vet'), PARAMS);
    expect(res.status).toBe(403);
  });

  it('missing ?capability → 400', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await DELETE(delReq(), PARAMS);
    expect(res.status).toBe(400);
  });

  it('invalid ?capability → 400', async () => {
    auth.mockResolvedValue(SESSION);
    const res = await DELETE(delReq('wizardry'), PARAMS);
    expect(res.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it('removes the capability and returns the remaining list', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([]) // 1: DELETE
      .mockResolvedValueOnce([{ capability: 'vet' }]); // 2: re-list

    const res = await DELETE(delReq('groomer'), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ capabilities: ['vet'] });
    expect(queryTextOf(0)).toContain('DELETE FROM provider_capabilities');
    expect(sql.mock.calls[0]).toEqual(expect.arrayContaining(['100', 'groomer']));
  });
});
