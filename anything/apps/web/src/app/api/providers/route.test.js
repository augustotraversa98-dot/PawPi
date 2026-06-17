import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST/GET /api/providers — provider onboarding create + list (ticket 4a).
// auth() and `sql` are mocked at the module boundary; each `await sql\`...\``
// consumes one mockResolvedValueOnce in order. Identity chain: auth_users.id (42)
// -> user_profiles.auth_user_id (42) -> user_profiles.id (7); the owner key
// everywhere is user_profiles.id, never the auth id.

import { POST, GET } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
// getActiveTx/runWithTx are named exports requestContext imports; with no real
// pool in unit tests getActiveTx returns undefined, so setCurrentUserId (called
// by the lazy profile-create path) is a safe no-op and issues no extra query.
vi.mock('@/app/api/utils/sql', () => ({
  default: vi.fn(),
  getActiveTx: () => undefined,
  runWithTx: (tx, fn) => fn(),
}));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };

const jsonReq = (body) =>
  new Request('http://localhost/api/providers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const queryTextOf = (callIndex) => (sql.mock.calls[callIndex]?.[0] ?? []).join(' ');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/providers — create', () => {
  it('anonymous → 401, never touches the DB', async () => {
    auth.mockResolvedValue(undefined);

    const res = await POST(jsonReq({ name: 'X', provider_type: 'vet' }));

    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('missing name/provider_type → 400', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // profile lookup

    const res = await POST(jsonReq({ name: 'Only name' }));

    expect(res.status).toBe(400);
  });

  it('creates the providers row AND an active owner provider_staff row, slug generated from name', async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = {
      id: 100,
      owner_user_profile_id: 7,
      name: 'Happy Paws',
      slug: 'happy-paws',
      provider_type: 'vet',
      status: 'draft',
    };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // 1: profile lookup
      .mockResolvedValueOnce([]) // 2: slug collision check — none
      .mockResolvedValueOnce([CREATED]) // 3: provider + owner-staff CTE
      .mockResolvedValueOnce([]); // 4: provider_capabilities insert (SEPARATE statement)

    const res = await POST(jsonReq({ name: 'Happy Paws', provider_type: 'vet' }));

    expect(res.status).toBe(201);
    // capabilities[] defaults to [provider_type] when none provided and provider_type
    // is itself a valid capability (ticket 2.1) — so the provider surfaces in discovery.
    expect(await res.json()).toEqual({
      provider: { ...CREATED, capabilities: ['vet'] },
    });

    // The provider + owner-staff insert is ONE atomic CTE, membership fixed to
    // role 'owner' / status 'active'. Capabilities are NOT in this statement —
    // they were split out so the owner-staff row is visible to the capabilities
    // WITH CHECK (provider_capabilities RLS, 0027) under READ COMMITTED.
    const cteText = queryTextOf(2);
    expect(cteText).toContain('INSERT INTO providers');
    expect(cteText).toContain('INSERT INTO provider_staff');
    expect(cteText).not.toContain('INSERT INTO provider_capabilities');
    expect(cteText).toContain("'owner'");
    expect(cteText).toContain("'active'");
    expect(sql.mock.calls[2]).toEqual(expect.arrayContaining([7, 'happy-paws']));

    // Capabilities are inserted in a SEPARATE, LATER statement (after the staff row),
    // bound to the new provider's id (100).
    const capsText = queryTextOf(3);
    expect(capsText).toContain('INSERT INTO provider_capabilities');
    expect(capsText).toContain('ON CONFLICT');
    expect(sql.mock.calls[3]).toEqual(expect.arrayContaining([100, ['vet']]));
  });

  it('no profile yet → lazily creates the user_profiles row, then the provider + owner staff (201)', async () => {
    // Fresh business owner: signed up, never made a pet, so NO user_profiles row
    // exists (the #108 gap). The create must still succeed by lazy-creating it.
    auth.mockResolvedValue({
      user: { id: 42, email: 'owner@biz.com', name: 'Biz Owner' },
      expires: '9999999999',
    });
    const CREATED = {
      id: 200,
      owner_user_profile_id: 7,
      name: 'Biz',
      slug: 'biz',
      provider_type: 'vet',
      status: 'draft',
    };
    sql
      .mockResolvedValueOnce([]) // 0: ensureUserProfile lookup — NO profile
      .mockResolvedValueOnce([]) // 1: username collision check — base is free
      .mockResolvedValueOnce([{ id: 7 }]) // 2: INSERT user_profiles RETURNING id
      .mockResolvedValueOnce([]) // 3: slug collision check — none
      .mockResolvedValueOnce([CREATED]) // 4: provider + owner-staff CTE
      .mockResolvedValueOnce([]); // 5: provider_capabilities insert (SEPARATE statement)

    const res = await POST(jsonReq({ name: 'Biz', provider_type: 'vet' }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      provider: { ...CREATED, capabilities: ['vet'] },
    });

    // The profile was lazily created with the default role; username derives from
    // the email local-part, and the auth id is the bound value.
    const profileInsert = queryTextOf(2);
    expect(profileInsert).toContain('INSERT INTO user_profiles');
    expect(profileInsert).toContain("'pet_owner'");
    expect(sql.mock.calls[2]).toEqual(expect.arrayContaining([42, 'owner']));

    // The provider CTE used the NEWLY created profile id (7) as owner, and the
    // capabilities insert is a SEPARATE later statement bound to the new provider id.
    const cte = queryTextOf(4);
    expect(cte).toContain('INSERT INTO providers');
    expect(cte).toContain('INSERT INTO provider_staff');
    expect(sql.mock.calls[4]).toEqual(expect.arrayContaining([7, 'biz']));
    expect(queryTextOf(5)).toContain('INSERT INTO provider_capabilities');
    expect(sql.mock.calls[5]).toEqual(expect.arrayContaining([200, ['vet']]));
  });

  it('makes the slug unique on collision by appending a suffix', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([{ slug: 'happy-paws' }]) // collision: base taken
      .mockResolvedValueOnce([{ id: 101, slug: 'happy-paws-2' }]) // provider + staff CTE
      .mockResolvedValueOnce([]); // capabilities insert

    const res = await POST(jsonReq({ name: 'Happy Paws', provider_type: 'vet' }));

    expect(res.status).toBe(201);
    // The de-duplicated slug is what gets inserted.
    expect(sql.mock.calls[2]).toEqual(expect.arrayContaining(['happy-paws-2']));
  });

  it('accepts a multi-select capabilities[] and binds the deduped array to the SEPARATE caps insert', async () => {
    auth.mockResolvedValue(SESSION);
    const CREATED = { id: 102, name: 'Vet Shop', slug: 'vet-shop', provider_type: 'vet' };
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce([]) // slug check
      .mockResolvedValueOnce([CREATED]) // provider + owner-staff CTE
      .mockResolvedValueOnce([]); // capabilities insert (SEPARATE statement)

    const res = await POST(
      jsonReq({
        name: 'Vet Shop',
        provider_type: 'vet',
        capabilities: ['vet', 'shop', 'vet'], // dup collapses
      }),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      provider: { ...CREATED, capabilities: ['shop', 'vet'] },
    });
    // The validated, deduped array is bound to the unnest in the SEPARATE caps
    // statement (call 3), NOT the provider+staff CTE (call 2).
    expect(queryTextOf(3)).toContain('INSERT INTO provider_capabilities');
    const boundArrays = sql.mock.calls[3].filter((v) => Array.isArray(v));
    expect(boundArrays).toContainEqual(['vet', 'shop']);
  });

  it('rejects an invalid capability with 400 before any insert', async () => {
    auth.mockResolvedValue(SESSION);
    // Validation runs BEFORE the slug query, so only the profile lookup is consumed.
    sql.mockResolvedValueOnce([PROFILE_ROW]); // profile lookup

    const res = await POST(
      jsonReq({ name: 'X', provider_type: 'vet', capabilities: ['vet', 'wizardry'] }),
    );

    expect(res.status).toBe(400);
    // No slug check or CTE insert was issued (only the profile lookup ran).
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-array capabilities with 400', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]); // profile lookup

    const res = await POST(
      jsonReq({ name: 'X', provider_type: 'vet', capabilities: 'vet' }),
    );

    expect(res.status).toBe(400);
  });
});

describe('GET /api/providers — list the caller’s providers', () => {
  it('anonymous → 401', async () => {
    auth.mockResolvedValue(undefined);

    const res = await GET(new Request('http://localhost/api/providers'));

    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('returns only providers the caller is ACTIVE staff of', async () => {
    auth.mockResolvedValue(SESSION);
    const MINE = [{ id: 100, name: 'Happy Paws' }];
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile lookup
      .mockResolvedValueOnce(MINE); // join provider_staff (active, this user)

    const res = await GET(new Request('http://localhost/api/providers'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ providers: MINE });

    // The list is scoped by the caller's membership: active staff of theirs only.
    const text = queryTextOf(1);
    expect(text).toContain('JOIN provider_staff');
    expect(text).toContain("ps.status = 'active'");
    expect(sql.mock.calls[1]).toEqual(expect.arrayContaining([7]));
  });
});
