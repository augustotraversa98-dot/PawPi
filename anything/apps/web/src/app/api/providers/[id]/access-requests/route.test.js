import { describe, it, expect, vi, beforeEach } from 'vitest';

// POST /api/providers/[id]/access-requests — provider staff request scoped access
// to a pet. auth() and `sql` are mocked at the module boundary; resolveUserId and
// requireProviderRole run for real against the mocked sql. The sql call order per
// request is: 1) profile lookup, 2) membership, 3) pet owner lookup,
// [4) bookingId check], 5) dedup existing-grant check, last) the INSERT.
// CRITICAL: request/approve/revoke write NO care_access_audit row.

import { POST } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const ACTIVE_MEMBERSHIP = { id: 1, role: 'vet', status: 'active' };
const PARAMS = { params: { id: '100' } };
const VALID_SCOPES = ['medical_read', 'medical_write'];

const calls = () => sql.mock.calls;
const lastCall = () => calls()[calls().length - 1];
const lastQueryText = () => (lastCall()?.[0] ?? []).join(' ');
const lastValues = () => lastCall()?.slice(1) ?? [];
const allQueryText = () => calls().map((c) => (c[0] ?? []).join(' ')).join(' | ');

const postReq = (body) =>
  new Request('http://localhost/api/providers/100/access-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

// Standard auth+membership prefix; remaining args are the per-test sql results.
const arrange = (...rest) => {
  auth.mockResolvedValue(SESSION);
  sql
    .mockResolvedValueOnce([PROFILE_ROW]) // profile
    .mockResolvedValueOnce([ACTIVE_MEMBERSHIP]); // membership
  for (const r of rest) sql.mockResolvedValueOnce(r);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/providers/[id]/access-requests', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await POST(postReq({ petId: 5, scopes: VALID_SCOPES }), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('non-staff → 403', async () => {
    auth.mockResolvedValue(SESSION);
    sql
      .mockResolvedValueOnce([PROFILE_ROW]) // profile
      .mockResolvedValueOnce([]); // no active membership

    const res = await POST(postReq({ petId: 5, scopes: VALID_SCOPES }), PARAMS);
    expect(res.status).toBe(403);
  });

  it('missing petId → 400', async () => {
    arrange();
    const res = await POST(postReq({ scopes: VALID_SCOPES }), PARAMS);
    expect(res.status).toBe(400);
  });

  it('empty scopes array → 400', async () => {
    arrange();
    const res = await POST(postReq({ petId: 5, scopes: [] }), PARAMS);
    expect(res.status).toBe(400);
  });

  it('non-array scopes → 400', async () => {
    arrange();
    const res = await POST(postReq({ petId: 5, scopes: 'medical_read' }), PARAMS);
    expect(res.status).toBe(400);
  });

  it('a scope outside the enumerated set → 400', async () => {
    arrange();
    const res = await POST(
      postReq({ petId: 5, scopes: ['medical_read', 'bogus_scope'] }),
      PARAMS,
    );
    expect(res.status).toBe(400);
  });

  it('unknown pet → 404', async () => {
    arrange([]); // pet lookup: no row
    const res = await POST(postReq({ petId: 999, scopes: VALID_SCOPES }), PARAMS);
    expect(res.status).toBe(404);
  });

  it('happy path → pending grant, requested_by=provider, owner derived, scopes stored, NO audit row', async () => {
    arrange(
      [{ owner_user_id: 33 }], // pet owner lookup
      [], // dedup: no existing live grant
      [
        {
          id: 9,
          pet_id: 5,
          owner_user_id: 33,
          provider_id: 100,
          scopes: VALID_SCOPES,
          status: 'pending',
          requested_by: 'provider',
          booking_id: null,
        },
      ], // INSERT
    );

    const res = await POST(postReq({ petId: 5, scopes: VALID_SCOPES }), PARAMS);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.grant.status).toBe('pending');
    expect(json.grant.requested_by).toBe('provider');
    expect(json.grant.owner_user_id).toBe(33); // derived from pet owner, not the caller

    const text = lastQueryText();
    expect(text).toContain('INSERT INTO care_access_grants');
    const values = lastValues();
    expect(values).toContain('pending');
    expect(values).toContain('provider');
    expect(values).toContain(33); // owner_user_id derived from the pet
    expect(values).toContainEqual(VALID_SCOPES); // scopes stored verbatim

    // CRITICAL: a request is NOT a data access — no audit row anywhere.
    expect(allQueryText()).not.toContain('care_access_audit');
  });

  it('bookingId not matching (provider, pet) → 400', async () => {
    arrange(
      [{ owner_user_id: 33 }], // pet owner lookup
      [], // booking check: no matching vet_appointments row
    );

    const res = await POST(
      postReq({ petId: 5, scopes: VALID_SCOPES, bookingId: 77 }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    // The INSERT must never run.
    expect(allQueryText()).not.toContain('INSERT INTO care_access_grants');
  });

  it('valid bookingId is stored on the grant', async () => {
    arrange(
      [{ owner_user_id: 33 }], // pet owner lookup
      [{ id: 77 }], // booking check: matches provider + pet
      [], // dedup: none
      [{ id: 9, booking_id: 77, status: 'pending' }], // INSERT
    );

    const res = await POST(
      postReq({ petId: 5, scopes: VALID_SCOPES, bookingId: 77 }),
      PARAMS,
    );
    expect(res.status).toBe(201);
    expect(lastValues()).toContain(77);
  });

  it('existing PENDING grant → 409', async () => {
    arrange(
      [{ owner_user_id: 33 }], // pet owner lookup
      [{ id: 8 }], // dedup: a pending/active grant already exists
    );

    const res = await POST(postReq({ petId: 5, scopes: VALID_SCOPES }), PARAMS);
    expect(res.status).toBe(409);
    expect(allQueryText()).not.toContain('INSERT INTO care_access_grants');
  });

  it('existing ACTIVE grant → 409 (dedup query filters pending OR active)', async () => {
    arrange(
      [{ owner_user_id: 33 }], // pet owner lookup
      [{ id: 8 }], // dedup row present (active)
    );

    const res = await POST(postReq({ petId: 5, scopes: VALID_SCOPES }), PARAMS);
    expect(res.status).toBe(409);
    // The dedup query restricts to the two live statuses.
    const dedupText = calls()[calls().length - 1][0].join(' ');
    expect(dedupText).toContain("status IN ('pending', 'active')");
  });
});
