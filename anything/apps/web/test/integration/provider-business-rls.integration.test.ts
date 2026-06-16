// RLS R2e — PROVIDER / BUSINESS entity tables, proven on the REAL tables acting AS
// pawpi_app. Companion to pets-rls (R2a), social-rls (R2b), owner-private-rls (R2c),
// provider-records-rls (R2d).
//
// The fourth access shape: access by provider-STAFF MEMBERSHIP (active staff / owner|
// admin / business owner) with a PUBLISHED-discovery public-read window. The proofs
// mirror the routes EXACTLY — no wider:
//   providers          — discovery (published → any authed) vs management read (active
//                        staff incl. draft); create = owner; edit/publish = owner|admin;
//                        delete = owner.
//   provider_staff     — staff-list read (active staff) + own-row read (/provider-invites);
//                        the BOOTSTRAP owner row (the create CTE) + INVITE (owner|admin →
//                        admin/staff/vet); self-accept + admin role-change/soft-remove; no
//                        hard delete.
//   provider_services  — public read of a published provider's ACTIVE services + staff
//                        read of all; owner|admin writes.
//   provider_locations — public read of a published provider's ALL locations + staff
//                        read; owner|admin writes (incl. HARD delete).
//   provider_reviews   — owner(reviewer)-scoped FOR ALL (provider staff get ZERO —
//                        reviews-surfacing deferred).
//
// Plus the RECURSION RE-PROOF: provider_staff is now FORCE-RLS'd, yet the SECURITY
// DEFINER helpers that READ it (app_is_active_staff_of, app_is_provider_admin, and —
// via the full sibling suite — app_provider_has_grant/booking) must still bypass that
// RLS. A green full integration suite is the headline proof; the explicit helper-under-
// FORCE-RLS assertions live at the bottom of this file.
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
  seedProvider,
  seedStaff,
  seedService,
  seedLocation,
  seedReview,
} from './db';

// Two pet owners (reviewers). A/B carry pets so they can author provider_reviews.
const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };
// Provider-1 cast.
const OWNER = { authUserId: 10, profileId: 10, username: 'biz_owner' }; // business owner + active owner staff
const ADMIN = { authUserId: 11, profileId: 11, username: 'biz_admin' }; // active admin staff
const STAFF = { authUserId: 12, profileId: 12, username: 'biz_staff' }; // active plain staff
const OUTSIDER = { authUserId: 13, profileId: 13, username: 'outsider' }; // authed, unaffiliated
const INVITEE = { authUserId: 14, profileId: 14, username: 'invitee' }; // a pending 'invited' row
const CREATOR = { authUserId: 20, profileId: 20, username: 'creator' }; // creates a brand-new provider
// Provider-2 cast (cross-provider isolation).
const OWNER2 = { authUserId: 30, profileId: 30, username: 'biz_owner2' };
const STAFF2 = { authUserId: 31, profileId: 31, username: 'biz_staff2' };

const P1 = 1; // draft by default; tests publish it as needed
const P2 = 2;

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

// Provider 1 (draft) with owner+admin+staff active and one pending invitee; provider 2
// (draft) with its own owner+staff. Sequences are bumped past the explicit ids so the
// bootstrap CTE / invite / write inserts (sequence-driven) never collide.
beforeEach(async () => {
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  for (const u of [OWNER, ADMIN, STAFF, OUTSIDER, INVITEE, CREATOR, OWNER2, STAFF2]) {
    await seedUser(raw, u);
  }
  await seedProvider(raw, { providerId: P1, ownerUserProfileId: OWNER.profileId, slug: 'clinic-1' });
  await seedStaff(raw, { providerId: P1, userProfileId: OWNER.profileId, role: 'owner', status: 'active' });
  await seedStaff(raw, { providerId: P1, userProfileId: ADMIN.profileId, role: 'admin', status: 'active' });
  await seedStaff(raw, { providerId: P1, userProfileId: STAFF.profileId, role: 'staff', status: 'active' });
  await seedStaff(raw, { providerId: P1, userProfileId: INVITEE.profileId, role: 'vet', status: 'invited' });
  await seedProvider(raw, { providerId: P2, ownerUserProfileId: OWNER2.profileId, slug: 'clinic-2' });
  await seedStaff(raw, { providerId: P2, userProfileId: OWNER2.profileId, role: 'owner', status: 'active' });
  await seedStaff(raw, { providerId: P2, userProfileId: STAFF2.profileId, role: 'staff', status: 'active' });
  await raw`select setval(pg_get_serial_sequence('providers','id'), (select max(id) from providers))`;
  await raw`select setval(pg_get_serial_sequence('provider_staff','id'), (select max(id) from provider_staff))`;
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. providers — discovery (published, any authed) vs management read (active staff);
//    create=owner, update=owner|admin, delete=owner.
describe('RLS R2e — providers (as pawpi_app)', () => {
  it('discovery: a PUBLISHED provider is readable by any authed user; a DRAFT is not', async () => {
    // Both draft → an outsider sees nothing.
    await asApp(OUTSIDER.profileId, async (tx) => {
      expect(await tx`select id from providers`).toHaveLength(0);
    });
    await raw`update providers set status = 'published' where id = ${P1}`;
    await asApp(OUTSIDER.profileId, async (tx) => {
      // Sees the published one only, never the still-draft P2.
      expect(ids(await tx`select id from providers`)).toEqual([P1]);
    });
  });

  it('management read: active staff see their own DRAFT provider, never another provider', async () => {
    await asApp(STAFF.profileId, async (tx) => {
      expect(ids(await tx`select id from providers`)).toEqual([P1]);
    });
  });

  it('no identity → zero rows (both draft, deny-by-default)', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from providers`).toHaveLength(0);
    });
  });

  it('INSERT: the creator may own the row, but WITH CHECK rejects owning it as someone else', async () => {
    await asApp(CREATOR.profileId, async (tx) => {
      const created = await tx`
        insert into providers (owner_user_profile_id, provider_type, name, slug, status)
        values (${CREATOR.profileId}, 'vet', 'Mine', 'mine', 'draft') returning id, owner_user_profile_id
      `;
      expect(created).toHaveLength(1);
      expect(created[0].owner_user_profile_id).toBe(CREATOR.profileId);
    });
    await expect(
      asApp(CREATOR.profileId, (tx) => tx`
        insert into providers (owner_user_profile_id, provider_type, name, slug, status)
        values (${OWNER.profileId}, 'vet', 'Forged', 'forged', 'draft')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('UPDATE (profile + publish): owner|admin yes, plain staff and outsiders affect ZERO rows', async () => {
    await asApp(ADMIN.profileId, async (tx) => {
      expect(await tx`update providers set name = 'Renamed' where id = ${P1} returning id`).toHaveLength(1);
      const pub = await tx`update providers set status = 'published' where id = ${P1} returning status`;
      expect(pub[0].status).toBe('published');
    });
    await asApp(STAFF.profileId, async (tx) => {
      expect(await tx`update providers set name = 'Nope' where id = ${P1} returning id`).toHaveLength(0);
    });
    await asApp(OUTSIDER.profileId, async (tx) => {
      expect(await tx`update providers set name = 'Nope' where id = ${P1} returning id`).toHaveLength(0);
    });
  });

  it('DELETE: the business owner may delete, a non-owner admin cannot', async () => {
    await asApp(ADMIN.profileId, async (tx) => {
      expect(await tx`delete from providers where id = ${P1} returning id`).toHaveLength(0);
    });
    const [{ n }] = await raw`select count(*)::int as n from providers where id = ${P1}`;
    expect(n).toBe(1); // survived the admin delete attempt
    await asApp(OWNER.profileId, async (tx) => {
      expect(await tx`delete from providers where id = ${P1} returning id`).toHaveLength(1);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. provider_staff — staff-list + own-row read; bootstrap + invite insert; self-accept
//    + admin update; no hard delete. This table FEEDS the DEFINER helpers.
describe('RLS R2e — provider_staff (as pawpi_app)', () => {
  it('SELECT: active staff see the whole staff list of their provider, never another', async () => {
    await asApp(STAFF.profileId, async (tx) => {
      const rows = await tx`select user_profile_id from provider_staff order by user_profile_id`;
      expect(rows.map((r: any) => r.user_profile_id)).toEqual([
        OWNER.profileId, ADMIN.profileId, STAFF.profileId, INVITEE.profileId,
      ]);
    });
    await asApp(STAFF2.profileId, async (tx) => {
      const rows = await tx`select user_profile_id from provider_staff order by user_profile_id`;
      expect(rows.map((r: any) => r.user_profile_id)).toEqual([OWNER2.profileId, STAFF2.profileId]);
    });
  });

  it('SELECT: an invited (not-yet-active) user sees their OWN row (powers /provider-invites)', async () => {
    await asApp(INVITEE.profileId, async (tx) => {
      const rows = await tx`select provider_id, status from provider_staff`;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ provider_id: P1, status: 'invited' });
    });
    // An unaffiliated user sees nothing.
    await asApp(OUTSIDER.profileId, async (tx) => {
      expect(await tx`select id from provider_staff`).toHaveLength(0);
    });
  });

  it('BOOTSTRAP: the real provider-create CTE inserts the provider + its owner staff row in ONE statement', async () => {
    const created = await asApp(CREATOR.profileId, (tx) => tx`
      WITH new_provider AS (
        INSERT INTO providers
          (owner_user_profile_id, provider_type, name, slug, bio, logo_url, status)
        VALUES
          (${CREATOR.profileId}, 'vet', 'Fresh Clinic', 'fresh-clinic', null, null, 'draft')
        RETURNING *
      ), new_staff AS (
        INSERT INTO provider_staff (provider_id, user_profile_id, role, status)
        SELECT id, ${CREATOR.profileId}, 'owner', 'active' FROM new_provider
        RETURNING id
      )
      SELECT * FROM new_provider
    `);
    expect(created).toHaveLength(1);
    const newProviderId = created[0].id;
    // The owner staff row exists and is active — the bootstrap WITH CHECK let it through.
    const [staffRow] = await raw`
      select role, status from provider_staff
      where provider_id = ${newProviderId} and user_profile_id = ${CREATOR.profileId}
    `;
    expect(staffRow).toMatchObject({ role: 'owner', status: 'active' });
  });

  it('BOOTSTRAP is membership-absence gated: a bare owner-insert into an EXISTING provider is rejected', async () => {
    // P1 already has active staff (its unremovable owner), so the absence gate fails;
    // the outsider is not an admin either → both INSERT branches reject.
    await expect(
      asApp(OUTSIDER.profileId, (tx) => tx`
        insert into provider_staff (provider_id, user_profile_id, role, status)
        values (${P1}, ${OUTSIDER.profileId}, 'owner', 'active')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('INVITE: owner|admin invite admin/staff/vet; plain staff cannot invite; owner is not invitable', async () => {
    // admin invites the outsider as 'staff'
    await asApp(ADMIN.profileId, async (tx) => {
      const inv = await tx`
        insert into provider_staff (provider_id, user_profile_id, role, status)
        values (${P1}, ${OUTSIDER.profileId}, 'staff', 'invited') returning id, status
      `;
      expect(inv).toHaveLength(1);
      expect(inv[0].status).toBe('invited');
    });
    await raw`delete from provider_staff where provider_id = ${P1} and user_profile_id = ${OUTSIDER.profileId}`;
    // plain staff cannot invite (not admin; and the bootstrap branch needs user_profile_id = me)
    await expect(
      asApp(STAFF.profileId, (tx) => tx`
        insert into provider_staff (provider_id, user_profile_id, role, status)
        values (${P1}, ${OUTSIDER.profileId}, 'staff', 'invited')
      `),
    ).rejects.toThrow(/row-level security/i);
    // admin cannot invite as 'owner' (INVITABLE_ROLES excludes owner)
    await expect(
      asApp(ADMIN.profileId, (tx) => tx`
        insert into provider_staff (provider_id, user_profile_id, role, status)
        values (${P1}, ${OUTSIDER.profileId}, 'owner', 'invited')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('UPDATE: the invitee self-accepts; an outsider cannot accept someone else\'s invite', async () => {
    await asApp(INVITEE.profileId, async (tx) => {
      const accepted = await tx`
        update provider_staff set status = 'active', updated_at = now()
        where provider_id = ${P1} and user_profile_id = ${INVITEE.profileId} and status = 'invited'
        returning id, status
      `;
      expect(accepted).toHaveLength(1);
      expect(accepted[0].status).toBe('active');
    });
    await raw`update provider_staff set status = 'invited' where provider_id = ${P1} and user_profile_id = ${INVITEE.profileId}`;
    await asApp(OUTSIDER.profileId, async (tx) => {
      expect(await tx`
        update provider_staff set status = 'active'
        where provider_id = ${P1} and user_profile_id = ${INVITEE.profileId} returning id
      `).toHaveLength(0);
    });
  });

  it('UPDATE: owner|admin change a member\'s role / soft-remove; plain staff affect ZERO', async () => {
    await asApp(ADMIN.profileId, async (tx) => {
      expect(await tx`
        update provider_staff set role = 'vet' where provider_id = ${P1} and user_profile_id = ${STAFF.profileId} returning id
      `).toHaveLength(1);
      expect(await tx`
        update provider_staff set status = 'removed' where provider_id = ${P1} and user_profile_id = ${STAFF.profileId} returning id
      `).toHaveLength(1);
    });
    // A plain staff member cannot touch another member's row.
    await asApp(STAFF.profileId, async (tx) => {
      expect(await tx`
        update provider_staff set role = 'admin' where provider_id = ${P1} and user_profile_id = ${OWNER.profileId} returning id
      `).toHaveLength(0);
    });
  });

  it('DELETE: no hard-delete policy — even owner|admin delete ZERO rows (removal is a soft UPDATE)', async () => {
    await asApp(ADMIN.profileId, async (tx) => {
      expect(await tx`delete from provider_staff where provider_id = ${P1} and user_profile_id = ${STAFF.profileId} returning id`).toHaveLength(0);
    });
    await asApp(OWNER.profileId, async (tx) => {
      expect(await tx`delete from provider_staff where provider_id = ${P1} and user_profile_id = ${STAFF.profileId} returning id`).toHaveLength(0);
    });
    const [{ n }] = await raw`select count(*)::int as n from provider_staff where provider_id = ${P1} and user_profile_id = ${STAFF.profileId}`;
    expect(n).toBe(1);
  });

  it('no identity → zero rows', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from provider_staff`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. provider_services — public read (active service of published provider) + staff read
//    (all); owner|admin writes.
describe('RLS R2e — provider_services (as pawpi_app)', () => {
  beforeEach(async () => {
    await seedService(raw, { serviceId: 100, providerId: P1, active: true });
    await seedService(raw, { serviceId: 101, providerId: P1, active: false });
    await seedService(raw, { serviceId: 102, providerId: P2, active: true });
    await raw`select setval(pg_get_serial_sequence('provider_services','id'), (select max(id) from provider_services))`;
  });

  it('staff read ALL of their provider\'s services (active + inactive), even while DRAFT', async () => {
    await asApp(STAFF.profileId, async (tx) => {
      expect(ids(await tx`select id from provider_services where provider_id = ${P1}`)).toEqual([100, 101]);
    });
    // Outsider sees nothing while the provider is draft.
    await asApp(OUTSIDER.profileId, async (tx) => {
      expect(await tx`select id from provider_services`).toHaveLength(0);
    });
  });

  it('public read: a PUBLISHED provider\'s ACTIVE services only (never inactive, never a draft provider\'s)', async () => {
    await raw`update providers set status = 'published' where id = ${P1}`;
    await asApp(OUTSIDER.profileId, async (tx) => {
      // 100 (active, published) only — not 101 (inactive), not 102 (P2 still draft).
      expect(ids(await tx`select id from provider_services`)).toEqual([100]);
    });
  });

  it('writes: owner|admin insert/update/delete; plain staff and outsiders cannot', async () => {
    await asApp(ADMIN.profileId, async (tx) => {
      const created = await tx`
        insert into provider_services (provider_id, name, active) values (${P1}, 'New', true) returning id
      `;
      expect(created).toHaveLength(1);
      expect(await tx`update provider_services set name = 'Edited' where id = 100 returning id`).toHaveLength(1);
      expect(await tx`delete from provider_services where id = 101 returning id`).toHaveLength(1);
    });
    // plain staff: INSERT rejected by WITH CHECK; UPDATE/DELETE match zero rows.
    await expect(
      asApp(STAFF.profileId, (tx) => tx`insert into provider_services (provider_id, name) values (${P1}, 'Nope')`),
    ).rejects.toThrow(/row-level security/i);
    await asApp(STAFF.profileId, async (tx) => {
      expect(await tx`update provider_services set name = 'x' where id = 100 returning id`).toHaveLength(0);
      expect(await tx`delete from provider_services where id = 100 returning id`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. provider_locations — public read (ALL locations of a published provider) + staff
//    read; owner|admin writes incl. HARD delete.
describe('RLS R2e — provider_locations (as pawpi_app)', () => {
  beforeEach(async () => {
    await seedLocation(raw, { locationId: 200, providerId: P1 });
    await seedLocation(raw, { locationId: 201, providerId: P2 });
    await raw`select setval(pg_get_serial_sequence('provider_locations','id'), (select max(id) from provider_locations))`;
  });

  it('staff read their provider\'s locations while draft; outsiders see ZERO until published', async () => {
    await asApp(STAFF.profileId, async (tx) => {
      expect(ids(await tx`select id from provider_locations where provider_id = ${P1}`)).toEqual([200]);
    });
    await asApp(OUTSIDER.profileId, async (tx) => {
      expect(await tx`select id from provider_locations`).toHaveLength(0);
    });
  });

  it('public read: ALL locations of a PUBLISHED provider, never a draft provider\'s', async () => {
    await raw`update providers set status = 'published' where id = ${P1}`;
    await asApp(OUTSIDER.profileId, async (tx) => {
      expect(ids(await tx`select id from provider_locations`)).toEqual([200]); // P2 still draft
    });
  });

  it('writes: owner|admin insert/update/HARD-delete; plain staff cannot', async () => {
    await asApp(ADMIN.profileId, async (tx) => {
      expect(await tx`insert into provider_locations (provider_id, name) values (${P1}, 'New') returning id`).toHaveLength(1);
      expect(await tx`update provider_locations set name = 'Edited' where id = 200 returning id`).toHaveLength(1);
      expect(await tx`delete from provider_locations where id = 200 returning id`).toHaveLength(1);
    });
    await expect(
      asApp(STAFF.profileId, (tx) => tx`insert into provider_locations (provider_id, name) values (${P1}, 'Nope')`),
    ).rejects.toThrow(/row-level security/i);
    await asApp(STAFF.profileId, async (tx) => {
      expect(await tx`delete from provider_locations where id = 201 returning id`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. provider_reviews — owner(reviewer)-scoped writes + own-row read while the provider is
//    DRAFT (the public-read window opens only once published — ticket 2.2 / 0028; the
//    published-read proofs live in provider-reviews-surfacing.integration.test.ts). P1 is
//    draft here, so a non-reviewer still sees ZERO — the same shape R2e originally proved.
describe('RLS R2e — provider_reviews (as pawpi_app, draft provider)', () => {
  beforeEach(async () => {
    await seedReview(raw, { reviewId: 300, providerId: P1, ownerUserId: A.profileId, petId: A.petId });
    await seedReview(raw, { reviewId: 301, providerId: P1, ownerUserId: B.profileId, petId: B.petId });
    await raw`select setval(pg_get_serial_sequence('provider_reviews','id'), (select max(id) from provider_reviews))`;
  });

  it('the reviewer reads/writes ONLY their own review; another owner cannot read it (draft provider)', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(ids(await tx`select id from provider_reviews`)).toEqual([300]);
      expect(await tx`update provider_reviews set body = 'edited' where id = 300 returning id`).toHaveLength(1);
      const created = await tx`
        insert into provider_reviews (provider_id, owner_user_id, pet_id, rating, body)
        values (${P1}, ${A.profileId}, ${A.petId}, 4, 'second') returning id
      `;
      expect(created).toHaveLength(1);
      expect(await tx`delete from provider_reviews where id = 300 returning id`).toHaveLength(1);
    });
    await asApp(B.profileId, async (tx) => {
      expect(await tx`select id from provider_reviews where id = 300`).toHaveLength(0);
    });
  });

  it('provider staff (owner|admin|staff) get ZERO on a DRAFT provider (public read needs published)', async () => {
    for (const u of [OWNER, ADMIN, STAFF]) {
      await asApp(u.profileId, async (tx) => {
        expect(await tx`select id from provider_reviews`).toHaveLength(0);
      });
    }
  });

  it('WITH CHECK rejects authoring a review as another owner; no identity → zero', async () => {
    await expect(
      asApp(A.profileId, (tx) => tx`
        insert into provider_reviews (provider_id, owner_user_id, pet_id, rating, body)
        values (${P1}, ${B.profileId}, ${B.petId}, 1, 'forged')
      `),
    ).rejects.toThrow(/row-level security/i);
    await asApp(null, async (tx) => {
      expect(await tx`select id from provider_reviews`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. RECURSION RE-PROOF — provider_staff is FORCE-RLS'd, yet the SECURITY DEFINER
//    helpers that READ it still resolve correctly (DEFINER bypasses the row policy, so
//    no under-count and no "infinite recursion detected in policy"). The full sibling
//    suite (R2a–R2d) staying green is the headline proof; these are the explicit ones.
describe('RLS R2e — recursion re-proof: DEFINER helpers vs provider_staff FORCE RLS', () => {
  it('app_is_active_staff_of resolves the FORCE-RLS\'d provider_staff for the calling user', async () => {
    await asApp(STAFF.profileId, async (tx) => {
      expect((await tx`select app_is_active_staff_of(${P1}) as v`)[0].v).toBe(true);
      expect((await tx`select app_is_active_staff_of(${P2}) as v`)[0].v).toBe(false); // not staff of P2
    });
    await asApp(null, async (tx) => {
      expect((await tx`select app_is_active_staff_of(${P1}) as v`)[0].v).toBe(false); // no identity
    });
  });

  it('app_is_provider_admin reflects owner|admin only, under FORCE RLS', async () => {
    await asApp(OWNER.profileId, async (tx) => {
      expect((await tx`select app_is_provider_admin(${P1}) as v`)[0].v).toBe(true);
    });
    await asApp(ADMIN.profileId, async (tx) => {
      expect((await tx`select app_is_provider_admin(${P1}) as v`)[0].v).toBe(true);
    });
    await asApp(STAFF.profileId, async (tx) => {
      expect((await tx`select app_is_provider_admin(${P1}) as v`)[0].v).toBe(false); // plain staff ≠ admin
    });
  });

  it('app_provider_has_active_staff (the bootstrap gate) sees established providers only', async () => {
    await asApp(OUTSIDER.profileId, async (tx) => {
      expect((await tx`select app_provider_has_active_staff(${P1}) as v`)[0].v).toBe(true); // established
      expect((await tx`select app_provider_has_active_staff(${9999}) as v`)[0].v).toBe(false); // unknown/new
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. Catalog — every R2e table is ENABLE + FORCE RLS and carries its expected policies,
//    so none is left un-policied under FORCE and the migration applied the intended set.
describe('RLS R2e — catalog: provider-business tables are FORCE-RLS + policied', () => {
  const EXPECTED: Record<string, string[]> = {
    providers: ['providers_select', 'providers_insert', 'providers_update', 'providers_delete'],
    provider_staff: ['provider_staff_select', 'provider_staff_insert', 'provider_staff_update'],
    provider_services: ['provider_services_admin_all', 'provider_services_read'],
    provider_locations: ['provider_locations_admin_all', 'provider_locations_read'],
    // ticket 2.2 / 0028 replaced the R2e FOR ALL placeholder with the per-command set.
    provider_reviews: [
      'provider_reviews_select',
      'provider_reviews_insert',
      'provider_reviews_update',
      'provider_reviews_delete',
    ],
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
      const names = policies.map((p: any) => p.policyname);
      for (const p of expected) {
        expect(names, `${table} policy ${p} present`).toContain(p);
      }
    }
  });
});
