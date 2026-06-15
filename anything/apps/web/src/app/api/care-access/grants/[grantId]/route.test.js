import { describe, it, expect, vi, beforeEach } from 'vitest';

// PATCH /api/care-access/grants/[grantId] — owner approves / denies / revokes a
// grant. auth() and `sql` are mocked at the module boundary; resolveUserId runs
// for real against the mocked sql. The sql call order is: 1) profile lookup,
// 2) load the grant scoped to me (id + owner_user_id), last) the UPDATE.
// Lifecycle is on the row; NO care_access_audit row is ever written here.

import { PATCH } from './route';
import { auth } from '@/auth';
import sql from '@/app/api/utils/sql';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const SESSION = { user: { id: 42 }, expires: '9999999999' };
const PROFILE_ROW = { id: 7, auth_user_id: 42 };
const PARAMS = { params: { grantId: '9' } };

const calls = () => sql.mock.calls;
const lastCall = () => calls()[calls().length - 1];
const lastQueryText = () => (lastCall()?.[0] ?? []).join(' ');
const lastValues = () => lastCall()?.slice(1) ?? [];
const allQueryText = () => calls().map((c) => (c[0] ?? []).join(' ')).join(' | ');

const patchReq = (body) =>
  new Request('http://localhost/api/care-access/grants/9', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

// Standard auth prefix; `grant` is the row returned by the scoped load (or [] for
// not-mine); remaining args are subsequent sql results (the UPDATE).
const arrange = (grantLoad, ...rest) => {
  auth.mockResolvedValue(SESSION);
  sql.mockResolvedValueOnce([PROFILE_ROW]); // profile
  sql.mockResolvedValueOnce(grantLoad); // scoped grant load
  for (const r of rest) sql.mockResolvedValueOnce(r);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PATCH /api/care-access/grants/[grantId]', () => {
  it('401 when unauthenticated', async () => {
    auth.mockResolvedValue(null);
    const res = await PATCH(patchReq({ action: 'approve' }), PARAMS);
    expect(res.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it('unknown action → 400, no grant load', async () => {
    auth.mockResolvedValue(SESSION);
    sql.mockResolvedValueOnce([PROFILE_ROW]);
    const res = await PATCH(patchReq({ action: 'bogus' }), PARAMS);
    expect(res.status).toBe(400);
    expect(sql).toHaveBeenCalledTimes(1); // never loaded the grant
  });

  it('not my grant → 404', async () => {
    arrange([]); // scoped load returns nothing
    const res = await PATCH(patchReq({ action: 'approve' }), PARAMS);
    expect(res.status).toBe(404);
  });

  // ---- approve ----
  it('approve: pending → active sets granted_at, no audit row', async () => {
    arrange(
      [{ id: 9, status: 'pending' }], // load
      [{ id: 9, status: 'active' }], // update
    );

    const res = await PATCH(patchReq({ action: 'approve' }), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).grant.status).toBe('active');

    const text = lastQueryText();
    expect(text).toContain('UPDATE care_access_grants');
    expect(text).toContain('granted_at = NOW()');
    expect(lastValues()).toContain('active');
    // owner scope on the write too.
    expect(lastValues()).toContain(7);
    // request/approve/revoke never audit.
    expect(allQueryText()).not.toContain('care_access_audit');
  });

  it('approve with expiresAt sets expires_at', async () => {
    arrange(
      [{ id: 9, status: 'pending' }], // load
      [{ id: 9, status: 'active', expires_at: '2027-01-01' }], // update
    );

    const res = await PATCH(
      patchReq({ action: 'approve', expiresAt: '2027-01-01' }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    expect(lastQueryText()).toContain('expires_at');
    expect(lastValues()).toContain('2027-01-01');
  });

  it('approve on a non-pending grant → 409', async () => {
    arrange([{ id: 9, status: 'active' }]);
    const res = await PATCH(patchReq({ action: 'approve' }), PARAMS);
    expect(res.status).toBe(409);
    expect(allQueryText()).not.toContain('UPDATE care_access_grants');
  });

  // ---- deny ----
  it('deny: pending → revoked sets revoked_at', async () => {
    arrange(
      [{ id: 9, status: 'pending' }], // load
      [{ id: 9, status: 'revoked' }], // update
    );

    const res = await PATCH(patchReq({ action: 'deny' }), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).grant.status).toBe('revoked');

    const text = lastQueryText();
    expect(text).toContain('UPDATE care_access_grants');
    expect(text).toContain('revoked_at = NOW()');
    expect(lastValues()).toContain('revoked');
  });

  it('deny on a non-pending grant → 409', async () => {
    arrange([{ id: 9, status: 'active' }]);
    const res = await PATCH(patchReq({ action: 'deny' }), PARAMS);
    expect(res.status).toBe(409);
  });

  // ---- revoke ----
  it('revoke: active → revoked sets revoked_at', async () => {
    arrange(
      [{ id: 9, status: 'active' }], // load
      [{ id: 9, status: 'revoked' }], // update
    );

    const res = await PATCH(patchReq({ action: 'revoke' }), PARAMS);
    expect(res.status).toBe(200);
    expect((await res.json()).grant.status).toBe('revoked');

    const text = lastQueryText();
    expect(text).toContain('revoked_at = NOW()');
    expect(lastValues()).toContain('revoked');
  });

  it('revoke on a pending (non-active) grant → 409', async () => {
    arrange([{ id: 9, status: 'pending' }]);
    const res = await PATCH(patchReq({ action: 'revoke' }), PARAMS);
    expect(res.status).toBe(409);
    expect(allQueryText()).not.toContain('UPDATE care_access_grants');
  });
});
