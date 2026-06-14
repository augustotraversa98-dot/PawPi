import { describe, it, expect, vi, beforeEach } from 'vitest';

// Authorization contract for requireProviderRole — the reusable provider-side
// chokepoint (docs/provider-design.md §4). Authorization is by provider_staff
// MEMBERSHIP, never by user_profiles.role. DB is mocked at the module boundary:
// `sql` is a tagged-template mock, each `await sql\`...\`` consumes one
// mockResolvedValueOnce — same pattern as careAccess.test.js.
//
// Postgres does the filtering (status='active' AND role = ANY(allowed)), so every
// denial mode (no membership / removed / invited / disallowed role / wrong
// provider) surfaces identically as an EMPTY result.

import {
  requireProviderRole,
  ProviderAuthError,
  ALL_PROVIDER_ROLES,
} from './providerAuth';
import sql from '@/app/api/utils/sql';

vi.mock('@/app/api/utils/sql', () => ({ default: vi.fn() }));

const PROVIDER_ID = 10;
const USER_PROFILE_ID = 7;
const MEMBERSHIP_ROW = {
  id: 99,
  provider_id: PROVIDER_ID,
  user_profile_id: USER_PROFILE_ID,
  role: 'owner',
  status: 'active',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// The template-strings array of the Nth sql call, joined to plain text.
const queryTextOf = (callIndex) => (sql.mock.calls[callIndex]?.[0] ?? []).join(' ');

describe('requireProviderRole — denials throw ProviderAuthError(403)', () => {
  it('no membership → 403', async () => {
    sql.mockResolvedValueOnce([]); // provider_staff: no row

    await expect(
      requireProviderRole(PROVIDER_ID, USER_PROFILE_ID)
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      requireProviderRole(PROVIDER_ID, USER_PROFILE_ID)
    ).rejects.toBeInstanceOf(ProviderAuthError);
  });

  it("removed status → 403 (status='active' filter returns no row)", async () => {
    sql.mockResolvedValueOnce([]);
    await expect(
      requireProviderRole(PROVIDER_ID, USER_PROFILE_ID)
    ).rejects.toMatchObject({ status: 403 });
  });

  it("invited status → 403 (status='active' filter returns no row)", async () => {
    sql.mockResolvedValueOnce([]);
    await expect(
      requireProviderRole(PROVIDER_ID, USER_PROFILE_ID)
    ).rejects.toMatchObject({ status: 403 });
  });

  it('membership but role not in allowed set → 403 (role ANY-filter returns no row)', async () => {
    sql.mockResolvedValueOnce([]); // a 'staff' member asking for owner|admin
    await expect(
      requireProviderRole(PROVIDER_ID, USER_PROFILE_ID, ['owner', 'admin'])
    ).rejects.toMatchObject({ status: 403 });

    // The query is scoped to this provider + this user + active + allowed roles.
    const text = queryTextOf(0);
    expect(text).toContain('provider_id =');
    expect(text).toContain("status = 'active'");
    expect(text).toContain('role = ANY');
    expect(sql.mock.calls[0]).toEqual(
      expect.arrayContaining([PROVIDER_ID, USER_PROFILE_ID, ['owner', 'admin']])
    );
  });
});

describe('requireProviderRole — happy path', () => {
  it('active membership in an allowed role → returns the membership row', async () => {
    sql.mockResolvedValueOnce([MEMBERSHIP_ROW]);

    const row = await requireProviderRole(PROVIDER_ID, USER_PROFILE_ID);

    expect(row).toEqual(MEMBERSHIP_ROW);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('defaults allowedRoles to owner|admin when omitted', async () => {
    sql.mockResolvedValueOnce([MEMBERSHIP_ROW]);

    await requireProviderRole(PROVIDER_ID, USER_PROFILE_ID);

    expect(sql.mock.calls[0]).toEqual(
      expect.arrayContaining([['owner', 'admin']])
    );
  });

  it('a read path passes ALL_PROVIDER_ROLES so any active staff may read', async () => {
    sql.mockResolvedValueOnce([{ ...MEMBERSHIP_ROW, role: 'vet' }]);

    const row = await requireProviderRole(
      PROVIDER_ID,
      USER_PROFILE_ID,
      ALL_PROVIDER_ROLES
    );

    expect(row.role).toBe('vet');
    expect(sql.mock.calls[0]).toEqual(
      expect.arrayContaining([['owner', 'admin', 'staff', 'vet']])
    );
  });
});
