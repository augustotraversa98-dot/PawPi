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
// getActiveTx → null: no request transaction here, so withSavepoint runs its callback directly.
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn(), getActiveTx: () => null }));
// Whether the database can store edit permission is asked once and remembered; these tests read the grants query last.
vi.mock('@/app/api/utils/editAccess', async (importOriginal) => ({
  ...(await importOriginal()),
  editAccessSupported: vi.fn(async () => true),
}));

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
// 1) resolveUserId profile, 2) pet-ownership, 3) provider-published, 4) share lock,
// 5) hold the open grant, 6) close expired grants, 7) dedup, 8) approve a pending request,
// 9) INSERT.
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
      .mockResolvedValueOnce([]) // share lock
      .mockResolvedValueOnce([]) // open grant
      .mockResolvedValueOnce([]) // close expired
      .mockResolvedValueOnce([]) // dedup: none
      .mockResolvedValueOnce([]) // no pending request
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
      .mockResolvedValueOnce([]) // share lock
      .mockResolvedValueOnce([]) // open grant
      .mockResolvedValueOnce([]) // close expired
      .mockResolvedValueOnce([]) // dedup: none
      .mockResolvedValueOnce([]) // no pending request
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
      .mockResolvedValueOnce([]) // share lock
      .mockResolvedValueOnce([existing]) // open grant
      .mockResolvedValueOnce([]) // close expired
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

  // AUDIT A-26: the select-then-insert race. A concurrent request slips past the
  // dedup SELECT and the partial unique index (0128) makes the INSERT raise
  // 23505; the route returns the winning grant instead of a 500.
  it('a 23505 on INSERT (concurrent create) returns the winning grant, not a 500', async () => {
    auth.mockResolvedValue(SESSION);
    const winner = { id: 77, status: 'active', provider_id: 9, pet_id: 5 };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // resolveUserId
      .mockResolvedValueOnce([{ id: 5 }]) // pet
      .mockResolvedValueOnce([{ id: 9 }]) // provider
      .mockResolvedValueOnce([]) // share lock
      .mockResolvedValueOnce([]) // open grant
      .mockResolvedValueOnce([]) // close expired
      .mockResolvedValueOnce([]) // dedup: none
      .mockResolvedValueOnce([]) // no pending request
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' })) // INSERT loses
      .mockResolvedValueOnce([winner]); // winner SELECT

    const res = await POST(postReq({ petId: 5, providerId: 9 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.grant.id).toBe(77);
    expect(body.deduped).toBe(true);
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

  it("409 'sectioned_grant_exists' for the by-scope shape over an active grant by section, no INSERT", async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([{ id: 9 }])
      .mockResolvedValueOnce([]) // share lock
      .mockResolvedValueOnce([]) // open grant
      .mockResolvedValueOnce([]) // close expired
      .mockResolvedValueOnce([{ id: 60, scopes: ['record_sections'], sections: ['vaccines'] }]);

    const res = await POST(postReq({ petId: 5, providerId: 9 }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('sectioned_grant_exists');
    expect(allQueryTexts().some((t) => t.includes('INSERT INTO care_access_grants'))).toBe(false);
  });
});

describe('POST /api/care-access/grants by section', () => {
  const VALID = { petId: 5, providerId: 9, sections: ['vaccines'], expiry: '7d' };

  it.each([
    ['sections without expiry', { expiry: undefined }],
    ['expiry without sections', { sections: undefined }],
    ['empty sections', { sections: [] }],
    ['sections that are not a list', { sections: 'vaccines' }],
    ['an unknown section', { sections: ['vaccines', 'allergies'] }],
    ['a scope name as a section', { sections: ['medical_read'] }],
    ['an unknown expiry', { expiry: '2d' }],
    ['an expiry that is not a string', { expiry: ['7d'] }],
    ['an object property name as expiry', { expiry: 'toString' }],
    ['null sections', { sections: null }],
    ['scopes together with sections', { scopes: ['medical_read'] }],
    ['empty scopes together with sections', { scopes: [] }],
  ])('400 for %s, before any grant query', async (_label, change) => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);

    const res = await POST(postReq({ ...VALID, ...change }));
    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('the record_sections scope cannot be asked for by the by-scope shape', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const res = await POST(postReq({ petId: 5, providerId: 9, scopes: ['record_sections'] }));
    expect(res.status).toBe(400);
  });

  it('201: stores only the record_sections scope, the chosen sections in order and the interval', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockImplementation(async (strings) => {
      const text = strings.join(' ');
      if (text.includes('FROM user_profiles')) return [PROFILE_ROW];
      if (text.includes('INSERT INTO care_access_grants')) return [{ id: 101 }];
      if (text.includes('UPDATE care_access_grants')) return []; // nothing active or pending
      if (text.includes('sections @>')) return []; // not shared moments ago
      return [{ id: 5 }];
    });

    const res = await POST(
      postReq({ ...VALID, sections: ['lab_results', 'profile', 'profile'], expiry: '30d' }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ grant: { id: 101 } });
    expect(allBound()).toContainEqual(['record_sections']);
    expect(allBound()).toContainEqual(['profile', 'lab_results']);
    expect(allBound()).toContain('30 days');
  });

  it('200 deduped for the same choice sent again moments later: nothing ends, nothing is created', async () => {
    auth.mockResolvedValue(SESSION);
    const grant = { id: 101, status: 'active', sections: ['vaccines'] };
    sql.mockImplementation(async (strings) => {
      const text = strings.join(' ');
      if (text.includes('FROM user_profiles')) return [PROFILE_ROW];
      if (text.includes('sections @>')) return [grant];
      return [{ id: 5 }];
    });

    const res = await POST(postReq(VALID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ grant, deduped: true });
    const texts = allQueryTexts();
    expect(texts.some((t) => t.includes('INSERT INTO care_access_grants'))).toBe(false);
    expect(texts.some((t) => t.includes('UPDATE care_access_grants'))).toBe(false);
  });
});

describe("POST /api/care-access/grants while the vet's request is pending", () => {
  const APPROVED = { id: 55, status: 'active', requested_by: 'provider' };
  const isApproval = (text) => text.includes("status = 'pending'");
  const arrangePending = ({ insertFails = false } = {}) => {
    auth.mockResolvedValue(SESSION);
    let inserted = false;
    sql.mockImplementation(async (strings) => {
      const text = strings.join(' ');
      if (text.includes('FROM user_profiles')) return [PROFILE_ROW];
      if (text.includes('FROM pets') || text.includes('FROM providers')) return [{ id: 5 }];
      if (text.includes('INSERT INTO care_access_grants')) {
        inserted = true;
        throw Object.assign(new Error('dup'), { code: '23505' });
      }
      // With insertFails the request is only there once the INSERT has been refused.
      if (isApproval(text)) return insertFails && !inserted ? [] : [APPROVED];
      return [];
    });
  };
  const approval = () => sql.mock.calls.find((c) => isApproval(c[0].join(' ')));

  it.each([
    ['by scope', {}, [['medical_read'], null, null]],
    ['by section', { sections: ['vaccines'], expiry: '7d' }, [['record_sections'], ['vaccines'], '7 days']],
  ])("200 { grant, approvedRequest } with the owner's choice, no INSERT (%s)", async (_label, extra, choice) => {
    arrangePending();
    const res = await POST(postReq({ petId: 5, providerId: 9, ...extra }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ grant: APPROVED, approvedRequest: true });
    // scopes, sections, interval, then the owner, pet and provider that scope the write.
    expect(approval().slice(1)).toEqual([...choice, 7, 5, 9]);
    expect(allQueryTexts().some((t) => t.includes('INSERT INTO care_access_grants'))).toBe(false);
  });

  it.each([
    ['by scope', {}],
    ['by section', { sections: ['vaccines'], expiry: '7d' }],
  ])('a request that arrives before the INSERT is approved instead (%s)', async (_label, extra) => {
    arrangePending({ insertFails: true });
    const res = await POST(postReq({ petId: 5, providerId: 9, ...extra }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ grant: APPROVED, approvedRequest: true });
  });
});
