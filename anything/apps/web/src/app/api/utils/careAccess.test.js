import { describe, it, expect, vi, beforeEach } from 'vitest';

// Enforcement contract for assertCareAccess — the single chokepoint for
// provider→pet-data (docs/provider-design.md §3). DB is mocked at the module
// boundary: `sql` is a tagged-template mock, and each `await sql\`...\`` consumes
// one mockResolvedValueOnce in order — same pattern as the route tests.
//
// The helper issues up to three queries in order:
//   1. provider_staff   (active membership)
//   2. care_access_grants (active, unexpired, scope-covering, this provider)
//   3. care_access_audit  (INSERT, happy path only)
// Postgres does the grant filtering, so every denial mode (expired / revoked /
// missing scope / wrong provider) surfaces identically as an EMPTY grant result.

import { assertCareAccess, CareAccessError } from './careAccess';
import sql from '@/app/api/utils/sql';

vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const PET_ID = 1;
const PROVIDER_ID = 10;
const SCOPE = 'medical_write';
const CTX = { staffUserId: 7, action: 'write', resource: 'vet_notes:123' };

const STAFF_ROW = { id: 99 };
const GRANT_ROW = {
  id: 555,
  pet_id: PET_ID,
  provider_id: PROVIDER_ID,
  owner_user_id: 3,
  scopes: ['medical_read', 'medical_write'],
  status: 'active',
  expires_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// Helper: the template-strings array of the Nth sql call, joined to plain text.
const queryTextOf = (callIndex) => (sql.mock.calls[callIndex]?.[0] ?? []).join(' ');

describe('assertCareAccess — denials all throw CareAccessError(403)', () => {
  it('no membership → 403, and never looks for a grant or writes an audit row', async () => {
    sql.mockResolvedValueOnce([]); // provider_staff: not active staff

    await expect(
      assertCareAccess(PET_ID, PROVIDER_ID, SCOPE, CTX)
    ).rejects.toMatchObject({ status: 403 });

    expect(sql).toHaveBeenCalledTimes(1); // stopped at the membership check
  });

  it('membership but no grant → 403, and writes no audit row', async () => {
    sql
      .mockResolvedValueOnce([STAFF_ROW]) // active staff
      .mockResolvedValueOnce([]); // no grant

    await expect(
      assertCareAccess(PET_ID, PROVIDER_ID, SCOPE, CTX)
    ).rejects.toBeInstanceOf(CareAccessError);

    expect(sql).toHaveBeenCalledTimes(2); // membership + grant, NO audit insert
  });

  it('expired grant → 403 (DB expiry filter returns no row)', async () => {
    // expires_at <= now() is excluded by the query, so the result is empty.
    sql.mockResolvedValueOnce([STAFF_ROW]).mockResolvedValueOnce([]);

    await expect(
      assertCareAccess(PET_ID, PROVIDER_ID, SCOPE, CTX)
    ).rejects.toMatchObject({ status: 403 });
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it('revoked grant → 403 (status != active filter returns no row)', async () => {
    sql.mockResolvedValueOnce([STAFF_ROW]).mockResolvedValueOnce([]);

    await expect(
      assertCareAccess(PET_ID, PROVIDER_ID, SCOPE, CTX)
    ).rejects.toMatchObject({ status: 403 });
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it('grant missing the required scope → 403 (scope ANY-filter returns no row)', async () => {
    sql.mockResolvedValueOnce([STAFF_ROW]).mockResolvedValueOnce([]);

    await expect(
      assertCareAccess(PET_ID, PROVIDER_ID, 'vaccinations_write', CTX)
    ).rejects.toMatchObject({ status: 403 });
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it('a grant for a DIFFERENT provider does not satisfy access (no cross-provider leak)', async () => {
    // Caller is active staff of PROVIDER_ID. A grant exists, but only for another
    // provider — the (provider_id = ${PROVIDER_ID}) filter excludes it, so the
    // grant query returns empty and access is denied.
    sql.mockResolvedValueOnce([STAFF_ROW]).mockResolvedValueOnce([]);

    await expect(
      assertCareAccess(PET_ID, PROVIDER_ID, SCOPE, CTX)
    ).rejects.toMatchObject({ status: 403 });

    // And the grant query was scoped to the caller's provider, not a wildcard.
    expect(queryTextOf(1)).toContain('provider_id =');
    expect(sql.mock.calls[1]).toContain(PROVIDER_ID);
    expect(sql).toHaveBeenCalledTimes(2);
  });
});

describe('assertCareAccess — happy path', () => {
  it('returns the grant AND writes exactly one audit row', async () => {
    sql
      .mockResolvedValueOnce([STAFF_ROW]) // 1: active staff
      .mockResolvedValueOnce([GRANT_ROW]) // 2: active, scope-covering grant
      .mockResolvedValueOnce(undefined); // 3: audit INSERT

    const grant = await assertCareAccess(PET_ID, PROVIDER_ID, SCOPE, CTX);

    expect(grant).toEqual(GRANT_ROW);

    // Exactly three queries — exactly one of which is the audit insert.
    expect(sql).toHaveBeenCalledTimes(3);
    const auditCalls = sql.mock.calls.filter((call) =>
      call[0].join(' ').includes('care_access_audit')
    );
    expect(auditCalls).toHaveLength(1);

    // The audit row binds the grant id, the acting staff, action and resource.
    const auditText = queryTextOf(2);
    expect(auditText).toContain('INSERT INTO care_access_audit');
    expect(sql.mock.calls[2]).toEqual(
      expect.arrayContaining([GRANT_ROW.id, CTX.staffUserId, CTX.action, CTX.resource])
    );
  });
});
