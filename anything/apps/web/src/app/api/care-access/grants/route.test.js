import { describe, it, expect, vi, beforeEach } from 'vitest';

// GET /api/care-access/grants — the OWNER's view of who has access to their pets.
// auth() and `sql` are mocked at the module boundary; resolveUserId runs for real
// against the mocked sql. The sql call order is: 1) profile lookup, 2) the grants
// query (single tagged template carrying the owner scope + optional filters).
// Isolation: the WHERE owner_user_id = me clause is what excludes other owners.

import { GET, POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const NO_PARAMS = { params: {} };

const lastCall = () => sql.mock.calls[sql.mock.calls.length - 1];
const lastQueryText = () => (lastCall()?.[0] ?? []).join(' ');
const lastValues = () => lastCall()?.slice(1) ?? [];

const getReq = (qs = '') =>
  new Request(`http://localhost/api/care-access/grants${qs}`);

const arrange = (grants) => {
  auth.mockResolvedValue(SESSION);
  sql
    .mockResolvedValueOnce([PROFILE_ROW]) // profile
    .mockResolvedValueOnce(grants); // grants query
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/care-access/grants', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await GET(getReq(), NO_PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('404 when no user profile', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([]); // no profile row
    const res = await GET(getReq(), NO_PARAMS);
    expect(res.status).toBe(404);
  });

  it('returns only the caller\'s grants, scoped by owner_user_id', async () => {
    arrange([
      { id: 1, pet_id: 5, owner_user_id: 7, provider_name: 'Dr Smith', pet_name: 'Rex' },
    ]);

    const res = await GET(getReq(), NO_PARAMS);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.grants).toHaveLength(1);
    // includes joined provider + pet names
    expect(json.grants[0].provider_name).toBe('Dr Smith');
    expect(json.grants[0].pet_name).toBe('Rex');

    const text = lastQueryText();
    expect(text).toContain('FROM care_access_grants');
    expect(text).toContain('owner_user_id =');
    expect(text).toContain('JOIN providers');
    expect(text).toContain('JOIN pets');
    expect(text).toContain('ORDER BY g.created_at DESC');
    // The owner id (7), resolved from the profile, scopes the query.
    expect(lastValues()).toContain(7);
  });

  it('passes ?petId and ?status filters into the query', async () => {
    arrange([]);
    const res = await GET(getReq('?petId=5&status=active'), NO_PARAMS);
    expect(res.status).toBe(200);

    const values = lastValues();
    expect(values).toContain('5'); // petId filter
    expect(values).toContain('active'); // status filter
  });

  it('no filters → both filter params bind null', async () => {
    arrange([]);
    const res = await GET(getReq(), NO_PARAMS);
    expect(res.status).toBe(200);
    // owner id present; both filters null (searchParams.get returns null when absent)
    const values = lastValues();
    expect(values).toContain(7);
    expect(values).toContain(null);
  });
});

// POST /api/care-access/grants — owner-initiated "Share clinic history". sql call order:
// 1) resolveUserId profile, 2) pet-ownership, 3) provider-published, 4) dedup, 5) INSERT.
const postReq = (body) =>
  new Request('http://localhost/api/care-access/grants', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const allQueryTexts = () => sql.mock.calls.map((c) => (c[0] ?? []).join(' '));
const allBound = () => sql.mock.calls.flatMap((c) => c.slice(1));

describe('POST /api/care-access/grants', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await POST(postReq({ petId: 5, providerId: 9 }));
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('400 when petId or providerId is missing', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // resolveUserId
    const res = await POST(postReq({ petId: 5 }));
    expect(res.status).toBe(400);
  });

  it("creates an ACTIVE owner grant defaulting to the 'medical_read' scope assertCareAccess honors", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId → 7
      .mockResolvedValueOnce([{ id: 5 }]) // pet belongs to me
      .mockResolvedValueOnce([{ id: 9 }]) // provider published
      .mockResolvedValueOnce([]) // dedup: none
      .mockResolvedValueOnce([
        { id: 100, pet_id: 5, owner_user_id: 7, provider_id: 9, scopes: ['medical_read'], status: 'active', requested_by: 'owner' },
      ]); // INSERT

    const res = await POST(postReq({ petId: 5, providerId: 9 }));
    expect(res.status).toBe(201);
    const { grant } = await res.json();
    expect(grant.status).toBe('active');
    expect(grant.requested_by).toBe('owner');
    // The stored scope is the granular read scope (NOT the coarse 'medical' no-op) — so a
    // provider `medical_read = ANY(scopes)` gate would now match this grant.
    expect(grant.scopes).toContain('medical_read');

    const insertText = allQueryTexts().find((t) => t.includes('INSERT INTO care_access_grants'));
    expect(insertText).toBeTruthy();
    // owner id (7) is bound (owner_user_id = me), and 'medical_read' is the bound scope.
    expect(allBound()).toContain(7);
    expect(allBound()).toContainEqual(['medical_read']);
    expect(allBound()).not.toContainEqual(['medical', 'vaccinations']);
  });

  it('uses the caller-supplied scopes when provided (valid vocabulary)', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([{ id: 9 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 100, status: 'active' }]);

    await POST(postReq({ petId: 5, providerId: 9, scopes: ['medical_read', 'appointments'] }));
    expect(allBound()).toContainEqual(['medical_read', 'appointments']);
  });

  it('400 when a scope is outside the shared care-access vocabulary (the no-op guard)', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // resolveUserId only — reject before any DB write

    const res = await POST(postReq({ petId: 5, providerId: 9, scopes: ['medical', 'vaccinations'] }));
    expect(res.status).toBe(400);
    // Never reached the pet lookup or INSERT.
    expect(allQueryTexts().some((t) => t.includes('care_access_grants'))).toBe(false);
    expect(allQueryTexts().some((t) => t.includes('FROM pets'))).toBe(false);
  });

  it('DEDUPS: an active grant already covering medical_read is returned, no INSERT', async () => {
    auth.mockResolvedValue(SESSION);
    const existing = { id: 50, status: 'active', scopes: ['medical_read'] };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 5 }]) // pet
      .mockResolvedValueOnce([{ id: 9 }]) // provider
      .mockResolvedValueOnce([existing]); // dedup HIT → return

    const res = await POST(postReq({ petId: 5, providerId: 9 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.grant.id).toBe(50);
    expect(body.deduped).toBe(true);
    // The dedup query binds the requested scope for the `scopes @> …` cover check.
    expect(allBound()).toContainEqual(['medical_read']);
    // No INSERT was issued.
    expect(allQueryTexts().some((t) => t.includes('INSERT INTO care_access_grants'))).toBe(false);
  });

  it("404 when the pet does NOT belong to the caller (owner-scoped)", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([]); // pet not owned by me → no row

    const res = await POST(postReq({ petId: 999, providerId: 9 }));
    expect(res.status).toBe(404);
    // Never reached the provider check or INSERT.
    expect(allQueryTexts().some((t) => t.includes('INSERT INTO care_access_grants'))).toBe(false);
  });

  it('404 when the provider is not found / not published', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5 }]) // pet ok
      .mockResolvedValueOnce([]); // provider not published → no row

    const res = await POST(postReq({ petId: 5, providerId: 9 }));
    expect(res.status).toBe(404);
  });
});
