// RLS R2f — the CONSENT LEDGER (care_access_grants + care_access_audit), proven on the
// REAL tables acting AS pawpi_app. Companion to pets-rls (R2a), social-rls (R2b),
// owner-private-rls (R2c), provider-records-rls (R2d), provider-business-rls (R2e). This
// is the FINAL R2 policy group — with it every real table is FORCE-RLS'd.
//
// The proofs mirror the routes EXACTLY — no wider:
//   care_access_grants — SELECT: owner trust view (GET /care-access/grants) OR active
//                          staff of the provider (the access-request INSERT…RETURNING
//                          snapshot + the direct assertCareAccess grant SELECT);
//                        INSERT: active staff requesting (requested_by='provider'); the
//                          owner never inserts;
//                        UPDATE: owner only (approve/deny/revoke); provider cannot;
//                        DELETE: none (status-flipped, never deleted).
//   care_access_audit  — INSERT: a staff member writes their OWN row (assertCareAccess);
//                        SELECT/UPDATE/DELETE: none → append-only, zero for everyone.
//
// Plus the RECURSION RE-PROOF: care_access_grants is now FORCE-RLS'd, yet 0019's
// app_provider_has_grant (SECURITY DEFINER) that READS it must still bypass that RLS. A
// green full suite (R2a–R2e exercise the helper via pets/medical) is the headline proof;
// the explicit helper-under-FORCE assertions + a live revoke→zero cross-check live here.
//
// As in the sibling suites we connect a SECOND porsager client AS pawpi_app
// (NOBYPASSRLS), set app.current_user_id per transaction, and assert allowed-vs-ZERO.
// The harness owner is a superuser, so FORCE RLS constrains only pawpi_app.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedOwnerWithPet,
  seedUser,
  seedProviderWithStaff,
  seedGrant,
  seedMedicalProfile,
} from './db';

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };
const STAFF = { authUserId: 3, profileId: 3, username: 'vetstaff' }; // active staff of P1
const STAFF2 = { authUserId: 4, profileId: 4, username: 'vetstaff2' }; // active staff of P2
const OUTSIDER = { authUserId: 5, profileId: 5, username: 'outsider' }; // authed, no role
const PROVIDER_ID = 1;
const PROVIDER2_ID = 2;

// raw = privileged superuser client (seeding / reset). app = the pawpi_app role.
let raw: Sql;
let app: Sql;

/** Run `fn` as pawpi_app inside one transaction stamped with `userId` (or no id). */
function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}

const ids = (rows: any[]) => rows.map((r: any) => r.id).sort((a, b) => a - b);

/** Seed a grant and hand back its id (care_access_audit.grant_id is a NOT NULL FK). */
async function seedGrantReturningId(opts: {
  petId: number;
  ownerUserId: number;
  providerId: number;
  scopes?: string[];
  status?: 'pending' | 'active' | 'revoked' | 'expired';
}): Promise<number> {
  await seedGrant(raw, opts);
  const [{ id }] = await raw<{ id: number }[]>`
    select id from care_access_grants
    where pet_id = ${opts.petId} and provider_id = ${opts.providerId}
    order by id desc limit 1
  `;
  return id;
}

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL'));
  app = postgres({
    host: url.hostname,
    port: Number(url.port),
    database: url.pathname.replace(/^\//, ''),
    username: 'pawpi_app',
    password: 'pawpi_app',
    max: 1,
    onnotice: () => {},
  });
});

afterAll(async () => {
  await app.end();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
});

// Two owners + their pets, two provider-staff users (STAFF↔P1, STAFF2↔P2), one outsider.
// No grant is seeded here — each test seeds the grant variant it needs so "no grant →
// zero" is unambiguous. The provider's business owner is the staff member itself (the
// typical solo-vet shape); only provider_staff MEMBERSHIP gates the grants policies.
beforeEach(async () => {
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  await seedUser(raw, STAFF);
  await seedUser(raw, STAFF2);
  await seedUser(raw, OUTSIDER);
  await seedProviderWithStaff(raw, {
    providerId: PROVIDER_ID,
    ownerUserProfileId: STAFF.profileId,
    staffUserProfileId: STAFF.profileId,
    staffRole: 'owner',
    slug: 'vet-clinic-1',
  });
  await seedProviderWithStaff(raw, {
    providerId: PROVIDER2_ID,
    ownerUserProfileId: STAFF2.profileId,
    staffUserProfileId: STAFF2.profileId,
    staffRole: 'owner',
    slug: 'vet-clinic-2',
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. care_access_grants — SELECT (owner trust view OR active staff of the provider).
describe('RLS R2f — care_access_grants SELECT (as pawpi_app)', () => {
  beforeEach(async () => {
    // An active grant: A's pet, provider 1. (A = owner; STAFF = active staff of P1.)
    await seedGrant(raw, {
      petId: A.petId, ownerUserId: A.profileId, providerId: PROVIDER_ID,
      scopes: ['medical_read'], status: 'active',
    });
  });

  it('owner A reads their own grant (the trust view)', async () => {
    await asApp(A.profileId, async (tx) => {
      const rows = await tx`select owner_user_id, provider_id, status from care_access_grants`;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ owner_user_id: A.profileId, provider_id: PROVIDER_ID });
    });
  });

  it('active staff of the provider read the grant (powers RETURNING + assertCareAccess)', async () => {
    await asApp(STAFF.profileId, async (tx) => {
      expect(await tx`select id from care_access_grants`).toHaveLength(1);
    });
  });

  it("a DIFFERENT provider's staff sees ZERO", async () => {
    await asApp(STAFF2.profileId, async (tx) => {
      expect(await tx`select id from care_access_grants`).toHaveLength(0);
    });
  });

  it('a non-participant owner (B) sees ZERO of A\'s grant', async () => {
    await asApp(B.profileId, async (tx) => {
      expect(await tx`select id from care_access_grants`).toHaveLength(0);
    });
  });

  it('no identity → zero rows (deny-by-default)', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from care_access_grants`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. care_access_grants — INSERT (the access-request route: active staff, provider-requested).
describe('RLS R2f — care_access_grants INSERT (as pawpi_app)', () => {
  it('active staff INSERT a pending request with RETURNING * (the snapshot proof)', async () => {
    // Mirrors providers/[id]/access-requests: owner_user_id = the PET OWNER (A), not the
    // caller. The staff SELECT branch is what lets RETURNING read the just-created row.
    const created = await asApp(STAFF.profileId, (tx) => tx`
      insert into care_access_grants
        (pet_id, owner_user_id, provider_id, scopes, status, requested_by, booking_id)
      values
        (${A.petId}, ${A.profileId}, ${PROVIDER_ID}, ${['medical_read']}, 'pending', 'provider', null)
      returning id, owner_user_id, status, requested_by
    `);
    expect(created).toHaveLength(1); // RETURNING saw the row → the staff SELECT branch works
    expect(created[0]).toMatchObject({
      owner_user_id: A.profileId, status: 'pending', requested_by: 'provider',
    });
  });

  it('an owner (A) cannot INSERT a grant — only provider staff request', async () => {
    await expect(
      asApp(A.profileId, (tx) => tx`
        insert into care_access_grants
          (pet_id, owner_user_id, provider_id, scopes, status, requested_by)
        values (${A.petId}, ${A.profileId}, ${PROVIDER_ID}, ${['medical_read']}, 'pending', 'owner')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('an outsider cannot INSERT a grant', async () => {
    await expect(
      asApp(OUTSIDER.profileId, (tx) => tx`
        insert into care_access_grants
          (pet_id, owner_user_id, provider_id, scopes, status, requested_by)
        values (${A.petId}, ${A.profileId}, ${PROVIDER_ID}, ${['medical_read']}, 'pending', 'provider')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it("staff cannot forge requested_by='owner' (the WITH CHECK pins it to 'provider')", async () => {
    await expect(
      asApp(STAFF.profileId, (tx) => tx`
        insert into care_access_grants
          (pet_id, owner_user_id, provider_id, scopes, status, requested_by)
        values (${A.petId}, ${A.profileId}, ${PROVIDER_ID}, ${['medical_read']}, 'pending', 'owner')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it("staff of provider 2 cannot request against provider 1", async () => {
    await expect(
      asApp(STAFF2.profileId, (tx) => tx`
        insert into care_access_grants
          (pet_id, owner_user_id, provider_id, scopes, status, requested_by)
        values (${A.petId}, ${A.profileId}, ${PROVIDER_ID}, ${['medical_read']}, 'pending', 'provider')
      `),
    ).rejects.toThrow(/row-level security/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. care_access_grants — UPDATE (owner approve/deny/revoke; provider cannot).
describe('RLS R2f — care_access_grants UPDATE (as pawpi_app)', () => {
  it('owner A approves (pending→active) and revokes (active→revoked) with RETURNING', async () => {
    await seedGrant(raw, {
      petId: A.petId, ownerUserId: A.profileId, providerId: PROVIDER_ID,
      scopes: ['medical_read'], status: 'pending',
    });
    await asApp(A.profileId, async (tx) => {
      const approved = await tx`
        update care_access_grants set status = 'active', granted_at = now(), updated_at = now()
        where owner_user_id = ${A.profileId} and status = 'pending'
        returning id, status
      `;
      expect(approved).toHaveLength(1);
      expect(approved[0].status).toBe('active');
      const revoked = await tx`
        update care_access_grants set status = 'revoked', revoked_at = now(), updated_at = now()
        where owner_user_id = ${A.profileId} and status = 'active'
        returning id, status
      `;
      expect(revoked).toHaveLength(1);
      expect(revoked[0].status).toBe('revoked');
    });
  });

  it('a provider (active staff) canNOT UPDATE the grant — owner-only', async () => {
    await seedGrant(raw, {
      petId: A.petId, ownerUserId: A.profileId, providerId: PROVIDER_ID,
      scopes: ['medical_read'], status: 'pending',
    });
    await asApp(STAFF.profileId, async (tx) => {
      // STAFF can SELECT the grant (active staff branch) but the UPDATE USING (owner-only)
      // matches zero rows → no self-approval.
      expect(await tx`select id from care_access_grants`).toHaveLength(1);
      expect(await tx`
        update care_access_grants set status = 'active' where status = 'pending' returning id
      `).toHaveLength(0);
    });
    const [{ status }] = await raw`select status from care_access_grants limit 1`;
    expect(status).toBe('pending'); // untouched
  });

  it('a non-participant owner (B) UPDATEs ZERO of A\'s grant', async () => {
    await seedGrant(raw, {
      petId: A.petId, ownerUserId: A.profileId, providerId: PROVIDER_ID,
      scopes: ['medical_read'], status: 'pending',
    });
    await asApp(B.profileId, async (tx) => {
      expect(await tx`
        update care_access_grants set status = 'active' returning id
      `).toHaveLength(0);
    });
  });

  it('DELETE is denied for everyone (grants are status-flipped, never deleted)', async () => {
    await seedGrant(raw, {
      petId: A.petId, ownerUserId: A.profileId, providerId: PROVIDER_ID,
      scopes: ['medical_read'], status: 'active',
    });
    await asApp(A.profileId, async (tx) => {
      expect(await tx`delete from care_access_grants returning id`).toHaveLength(0);
    });
    await asApp(STAFF.profileId, async (tx) => {
      expect(await tx`delete from care_access_grants returning id`).toHaveLength(0);
    });
    const [{ n }] = await raw`select count(*)::int as n from care_access_grants`;
    expect(n).toBe(1); // survived both delete attempts
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. Revoke is INSTANT — flipping a grant's status to 'revoked' immediately removes the
//    provider's downstream data access. Cross-checked through a medical table (R2d), which
//    also exercises app_provider_has_grant against the now-FORCE-RLS'd care_access_grants.
describe('RLS R2f — revoke flips downstream provider access to ZERO', () => {
  beforeEach(async () => {
    await seedMedicalProfile(raw, { profileRowId: 10, petId: A.petId, ownerUserId: A.profileId });
  });

  it('active grant → provider reads the medical profile; owner revoke → zero', async () => {
    await seedGrant(raw, {
      petId: A.petId, ownerUserId: A.profileId, providerId: PROVIDER_ID,
      scopes: ['medical_read'], status: 'active',
    });
    // Before revoke: STAFF reads A's medical profile via the active grant.
    await asApp(STAFF.profileId, async (tx) => {
      expect(ids(await tx`select id from pet_medical_profiles`)).toEqual([10]);
    });
    // Owner A revokes.
    await asApp(A.profileId, async (tx) => {
      const r = await tx`
        update care_access_grants set status = 'revoked', revoked_at = now()
        where owner_user_id = ${A.profileId} and status = 'active' returning id
      `;
      expect(r).toHaveLength(1);
    });
    // After revoke: provider access is gone — instantly.
    await asApp(STAFF.profileId, async (tx) => {
      expect(await tx`select id from pet_medical_profiles`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. care_access_audit — append-only. INSERT own row; no SELECT/UPDATE/DELETE.
describe('RLS R2f — care_access_audit (append-only, as pawpi_app)', () => {
  let grantId: number;
  beforeEach(async () => {
    grantId = await seedGrantReturningId({
      petId: A.petId, ownerUserId: A.profileId, providerId: PROVIDER_ID,
      scopes: ['medical_read'], status: 'active',
    });
  });

  it('a staff member INSERTs their OWN audit row (assertCareAccess path)', async () => {
    await asApp(STAFF.profileId, (tx) => tx`
      insert into care_access_audit (grant_id, staff_user_id, action, resource)
      values (${grantId}, ${STAFF.profileId}, 'read', 'pet_medical_profiles:10')
    `);
    const [{ n }] = await raw`select count(*)::int as n from care_access_audit`;
    expect(n).toBe(1);
  });

  it('a staff member canNOT forge an audit row attributed to ANOTHER staff', async () => {
    await expect(
      asApp(STAFF.profileId, (tx) => tx`
        insert into care_access_audit (grant_id, staff_user_id, action, resource)
        values (${grantId}, ${STAFF2.profileId}, 'read', 'forged')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('SELECT returns ZERO for everyone — no audit-review reader exists yet', async () => {
    await raw`
      insert into care_access_audit (grant_id, staff_user_id, action, resource)
      values (${grantId}, ${STAFF.profileId}, 'read', 'seeded')
    `;
    for (const uid of [A.profileId, STAFF.profileId, STAFF2.profileId, OUTSIDER.profileId, null]) {
      await asApp(uid, async (tx) => {
        expect(await tx`select id from care_access_audit`).toHaveLength(0);
      });
    }
  });

  it('UPDATE / DELETE are denied (append-only — no policy → zero rows under FORCE)', async () => {
    await raw`
      insert into care_access_audit (grant_id, staff_user_id, action, resource)
      values (${grantId}, ${STAFF.profileId}, 'read', 'seeded')
    `;
    await asApp(STAFF.profileId, async (tx) => {
      expect(await tx`update care_access_audit set resource = 'tampered' returning id`).toHaveLength(0);
      expect(await tx`delete from care_access_audit returning id`).toHaveLength(0);
    });
    const [{ resource, n }] = await raw`
      select resource, (select count(*)::int from care_access_audit) as n from care_access_audit limit 1
    `;
    expect(n).toBe(1);
    expect(resource).toBe('seeded'); // unchanged
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. RECURSION RE-PROOF — care_access_grants is FORCE-RLS'd, yet 0019's
//    app_provider_has_grant (SECURITY DEFINER) that READS it still resolves correctly
//    (DEFINER bypasses the row policy, so no under-count and no "infinite recursion
//    detected in policy"). The full sibling suite (R2a–R2e) staying green is the headline
//    proof; this is the explicit one.
describe('RLS R2f — recursion re-proof: app_provider_has_grant vs care_access_grants FORCE RLS', () => {
  it('returns true for active staff with an active grant, false after revoke / for other providers / no identity', async () => {
    await seedGrant(raw, {
      petId: A.petId, ownerUserId: A.profileId, providerId: PROVIDER_ID,
      scopes: ['medical_read'], status: 'active',
    });
    // Active staff of P1 with an active medical_read grant → true.
    await asApp(STAFF.profileId, async (tx) => {
      expect((await tx`select app_provider_has_grant(${A.petId}, 'medical_read') as v`)[0].v).toBe(true);
      // A scope not in the grant → false.
      expect((await tx`select app_provider_has_grant(${A.petId}, 'medical_write') as v`)[0].v).toBe(false);
    });
    // A different provider's staff → false (no grant for their provider).
    await asApp(STAFF2.profileId, async (tx) => {
      expect((await tx`select app_provider_has_grant(${A.petId}, 'medical_read') as v`)[0].v).toBe(false);
    });
    // No identity → false.
    await asApp(null, async (tx) => {
      expect((await tx`select app_provider_has_grant(${A.petId}, 'medical_read') as v`)[0].v).toBe(false);
    });
    // After the owner revokes, the DEFINER helper sees the flip → false.
    await raw`update care_access_grants set status = 'revoked' where provider_id = ${PROVIDER_ID}`;
    await asApp(STAFF.profileId, async (tx) => {
      expect((await tx`select app_provider_has_grant(${A.petId}, 'medical_read') as v`)[0].v).toBe(false);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. Catalog — both consent tables are ENABLE + FORCE RLS and carry their expected
//    policies, so neither is left un-policied under FORCE and the migration applied the
//    intended set (note the deliberate ABSENCE of any audit SELECT/UPDATE/DELETE policy).
describe('RLS R2f — catalog: consent tables are FORCE-RLS + policied', () => {
  const EXPECTED: Record<string, string[]> = {
    care_access_grants: [
      'care_access_grants_select',
      'care_access_grants_insert',
      'care_access_grants_update',
    ],
    care_access_audit: ['care_access_audit_insert'],
  };

  it('rowsecurity + forcerowsecurity = true and the expected policies exist', async () => {
    for (const [table, expected] of Object.entries(EXPECTED)) {
      const [flags] = await raw`
        select relrowsecurity, relforcerowsecurity
        from pg_class where oid = ${'public.' + table}::regclass
      `;
      expect(flags, `${table} should exist`).toBeDefined();
      expect(flags.relrowsecurity, `${table} ENABLE ROW LEVEL SECURITY`).toBe(true);
      expect(flags.relforcerowsecurity, `${table} FORCE ROW LEVEL SECURITY`).toBe(true);

      const policies = await raw`
        select policyname from pg_policies
        where schemaname = 'public' and tablename = ${table}
      `;
      const names = policies.map((p: any) => p.policyname).sort();
      expect(names).toEqual([...expected].sort());
    }
  });
});
