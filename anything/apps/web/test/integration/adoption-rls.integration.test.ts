// Adoption module RLS + flow (ticket 2.12 / migration 0038), proven on the REAL tables acting
// AS pawpi_app. Companion to shop-ecommerce-rls, chat-messaging-rls, payments-rls, etc. Covers
// the ticket's required integration surface:
//   1. capability gate — provider_has_capability(provider, 'adoption') drives the module gate.
//   2. adoptable_listings RLS — a PUBLISHED place's AVAILABLE listings are readable by any
//      authed (DISCOVERY); shelter ADMIN/STAFF see all (incl. pending/adopted + a draft place);
//      shelter admin writes; owners/outsiders cannot write.
//   3. adoption_applications RLS — the applicant sees OWN only; shelter staff see THEIR place's
//      applications; no cross-leak. Applicant submits AS self; shelter reviews.
//   4. adoption_favorites RLS — owner-private.
//   5. fee/donation via 2.3 — an adoption_fee order + a donation order ride the reused 0029
//      orders table with the right kinds + owner/staff RLS.
//   6. approval → adopter pet creation — app_approve_adoption creates a NEW pets row owned by
//      the APPLICANT, marks the application approved + the listing adopted; non-staff cannot.
//   7. completeness guard — the three new tables are ENABLE+FORCE RLS with policies.
//
// As in the sibling suites: a SECOND porsager client AS pawpi_app (NOBYPASSRLS), identity set
// per transaction, allowed-vs-ZERO. The harness owner is superuser, so FORCE RLS constrains
// only pawpi_app.

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
  seedCapability,
  seedAdoptableListing,
  seedAdoptionApplication,
  seedAdoptionFavorite,
  seedOrder,
} from './db';

// Identities.
const A = { authUserId: 1, profileId: 1, username: 'adopter', petId: 1, petName: 'Existing' }; // an applicant/adopter
const B = { authUserId: 2, profileId: 2, username: 'otheradopter', petId: 2, petName: 'Other' }; // another applicant
const SOWN = { authUserId: 3, profileId: 3, username: 'shelterown' }; // shelter owner/admin
const SSTF = { authUserId: 4, profileId: 4, username: 'shelterstaff' }; // shelter active staff
const SQ = { authUserId: 5, profileId: 5, username: 'otherprov' }; // a different provider's admin
const X = { authUserId: 6, profileId: 6, username: 'outsider' }; // authed outsider

const SHELTER = 10; // the shelter provider (published, holds 'adoption')
const DRAFT = 11; // a draft shelter (not discoverable)
const OTHER = 30; // a different provider (cross-leak control)

const LISTING = 100; // an available listing of SHELTER
const LISTING_PENDING = 101; // a pending listing of SHELTER (not discovery-visible)
const LISTING_DRAFT = 102; // an available listing of the DRAFT shelter

const APP_A = 500; // A's application for LISTING
const APP_B = 501; // B's application for LISTING

let raw: Sql;
let app: Sql;

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

beforeEach(async () => {
  // Applicants (with an existing pet each) + shelter/other-provider users.
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  await seedUser(raw, SOWN);
  await seedUser(raw, SSTF);
  await seedUser(raw, SQ);
  await seedUser(raw, X);

  // The published shelter with the 'adoption' capability + staff.
  await seedProvider(raw, { providerId: SHELTER, ownerUserProfileId: SOWN.profileId, slug: 'shelter', status: 'published' });
  await seedStaff(raw, { providerId: SHELTER, userProfileId: SOWN.profileId, role: 'owner', status: 'active' });
  await seedStaff(raw, { providerId: SHELTER, userProfileId: SSTF.profileId, role: 'staff', status: 'active' });
  await seedCapability(raw, { providerId: SHELTER, capability: 'adoption' });

  // A draft shelter (not discoverable) + its capability. SOWN is its active owner.
  await seedProvider(raw, { providerId: DRAFT, ownerUserProfileId: SOWN.profileId, slug: 'draftshelter', status: 'draft' });
  await seedStaff(raw, { providerId: DRAFT, userProfileId: SOWN.profileId, role: 'owner', status: 'active' });
  await seedCapability(raw, { providerId: DRAFT, capability: 'adoption' });

  // A different provider (cross-leak control).
  await seedProvider(raw, { providerId: OTHER, ownerUserProfileId: SQ.profileId, slug: 'otherprov', status: 'published' });
  await seedStaff(raw, { providerId: OTHER, userProfileId: SQ.profileId, role: 'owner', status: 'active' });

  // Listings.
  await seedAdoptableListing(raw, { listingId: LISTING, providerId: SHELTER });
  await seedAdoptableListing(raw, { listingId: LISTING_PENDING, providerId: SHELTER, status: 'pending' });
  await seedAdoptableListing(raw, { listingId: LISTING_DRAFT, providerId: DRAFT });
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. capability gate.
describe('2.12 — capability gate (provider_has_capability drives the module gate)', () => {
  it('the shelter holds the adoption capability; a different provider does not', async () => {
    const [{ has: shelterHas }] = await raw`select provider_has_capability(${SHELTER}, 'adoption') as has`;
    const [{ has: otherHas }] = await raw`select provider_has_capability(${OTHER}, 'adoption') as has`;
    expect(shelterHas).toBe(true);
    expect(otherHas).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. adoptable_listings RLS — discovery vs shelter staff/admin.
describe('2.12 — adoptable_listings RLS (published-available discovery vs shelter)', () => {
  it('any authed owner reads the published shelter\'s AVAILABLE listing (discovery)', async () => {
    await asApp(A.profileId, async (tx) => {
      const rows = await tx`select id from adoptable_listings where provider_id = ${SHELTER}`;
      // A sees only the AVAILABLE listing of the PUBLISHED shelter — NOT the pending one.
      expect(ids(rows)).toEqual([LISTING]);
    });
  });

  it('an owner does NOT see a pending listing or a draft-shelter listing', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(await tx`select id from adoptable_listings where id = ${LISTING_PENDING}`).toHaveLength(0);
      expect(await tx`select id from adoptable_listings where id = ${LISTING_DRAFT}`).toHaveLength(0);
    });
  });

  it('the shelter staff sees ALL its listings incl. pending + draft-shelter', async () => {
    await asApp(SOWN.profileId, async (tx) => {
      const shelterRows = await tx`select id from adoptable_listings where provider_id = ${SHELTER}`;
      expect(ids(shelterRows)).toEqual([LISTING, LISTING_PENDING]);
      // SOWN is also owner of the draft shelter → sees its listing.
      expect(await tx`select id from adoptable_listings where id = ${LISTING_DRAFT}`).toHaveLength(1);
    });
    // A non-admin active staff member ALSO reads via the staff branch.
    await asApp(SSTF.profileId, async (tx) => {
      expect(ids(await tx`select id from adoptable_listings where provider_id = ${SHELTER}`)).toEqual([
        LISTING,
        LISTING_PENDING,
      ]);
    });
  });

  it('a non-admin staff member CANNOT write the listing catalog (admin-only)', async () => {
    await expect(
      asApp(SSTF.profileId, (tx) => tx`
        insert into adoptable_listings (provider_id, name) values (${SHELTER}, 'forged')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('an owner CANNOT create or mutate a listing', async () => {
    await expect(
      asApp(A.profileId, (tx) => tx`
        insert into adoptable_listings (provider_id, name) values (${SHELTER}, 'forged')
      `),
    ).rejects.toThrow(/row-level security/i);
    await asApp(A.profileId, async (tx) => {
      const upd = await tx`update adoptable_listings set status = 'adopted' where id = ${LISTING} returning id`;
      expect(upd).toHaveLength(0); // RLS hides the row from the owner's UPDATE
    });
  });

  it('the shelter admin CAN create + update a listing', async () => {
    await asApp(SOWN.profileId, async (tx) => {
      const created = await tx`
        insert into adoptable_listings (provider_id, name, breed) values (${SHELTER}, 'Buddy', 'Beagle')
        returning id, name
      `;
      expect(created[0].name).toBe('Buddy');
      const upd = await tx`update adoptable_listings set status = 'pending' where id = ${LISTING} returning status`;
      expect(upd[0].status).toBe('pending');
    });
  });

  it('a DIFFERENT provider\'s admin cannot write the shelter\'s listings', async () => {
    await expect(
      asApp(SQ.profileId, (tx) => tx`
        insert into adoptable_listings (provider_id, name) values (${SHELTER}, 'forged')
      `),
    ).rejects.toThrow(/row-level security/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. adoption_applications RLS — applicant-own vs shelter-staff.
describe('2.12 — adoption_applications RLS (applicant-own vs shelter-staff)', () => {
  beforeEach(async () => {
    await seedAdoptionApplication(raw, { applicationId: APP_A, listingId: LISTING, providerId: SHELTER, applicantUserId: A.profileId });
    await seedAdoptionApplication(raw, { applicationId: APP_B, listingId: LISTING, providerId: SHELTER, applicantUserId: B.profileId });
  });

  it('applicant A reads ONLY A\'s application', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(ids(await tx`select id from adoption_applications`)).toEqual([APP_A]);
    });
  });

  it('shelter staff read BOTH applications to the shelter', async () => {
    await asApp(SSTF.profileId, async (tx) => {
      expect(ids(await tx`select id from adoption_applications`)).toEqual([APP_A, APP_B]);
    });
  });

  it('a different provider\'s admin reads ZERO of the shelter\'s applications', async () => {
    await asApp(SQ.profileId, async (tx) => {
      expect(await tx`select id from adoption_applications`).toHaveLength(0);
    });
    await asApp(X.profileId, async (tx) => {
      expect(await tx`select id from adoption_applications`).toHaveLength(0);
    });
  });

  it('an applicant can submit AS self but NOT as another user', async () => {
    await asApp(A.profileId, async (tx) => {
      const created = await tx`
        insert into adoption_applications (listing_id, provider_id, applicant_owner_user_id, status)
        values (${LISTING_PENDING}, ${SHELTER}, ${A.profileId}, 'submitted')
        returning id
      `;
      expect(created).toHaveLength(1);
    });
    await expect(
      asApp(A.profileId, (tx) => tx`
        insert into adoption_applications (listing_id, provider_id, applicant_owner_user_id, status)
        values (${LISTING_PENDING}, ${SHELTER}, ${B.profileId}, 'submitted')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('shelter staff can review (under_review/declined); owner cannot touch another\'s application', async () => {
    await asApp(SSTF.profileId, async (tx) => {
      const upd = await tx`update adoption_applications set status = 'under_review' where id = ${APP_A} returning status`;
      expect(upd[0].status).toBe('under_review');
    });
    // B cannot see/update A's application.
    await asApp(B.profileId, async (tx) => {
      const upd = await tx`update adoption_applications set status = 'approved' where id = ${APP_A} returning id`;
      expect(upd).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. adoption_favorites RLS — owner-private.
describe('2.12 — adoption_favorites RLS (owner-private)', () => {
  it('owner A reads their own favorite; B reads ZERO', async () => {
    await seedAdoptionFavorite(raw, { favoriteId: 1, ownerUserId: A.profileId, listingId: LISTING });
    await asApp(A.profileId, async (tx) => {
      expect(ids(await tx`select id from adoption_favorites`)).toEqual([1]);
    });
    await asApp(B.profileId, async (tx) => {
      expect(await tx`select id from adoption_favorites`).toHaveLength(0);
    });
  });

  it('an owner can favorite/unfavorite AS self only', async () => {
    await asApp(A.profileId, async (tx) => {
      const created = await tx`
        insert into adoption_favorites (owner_user_id, listing_id) values (${A.profileId}, ${LISTING})
        returning id
      `;
      expect(created).toHaveLength(1);
    });
    await expect(
      asApp(A.profileId, (tx) => tx`
        insert into adoption_favorites (owner_user_id, listing_id) values (${B.profileId}, ${LISTING})
      `),
    ).rejects.toThrow(/row-level security/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. fee / donation via the reused 2.3 orders table.
describe('2.12 — fee/donation orders (reuse 2.3 orders) + RLS', () => {
  it('an adoption_fee order + a donation order are owner-readable, shelter-staff-readable, no cross-leak', async () => {
    await seedOrder(raw, { orderId: 700, ownerUserId: A.profileId, providerId: SHELTER, kind: 'adoption_fee', amountCents: 5000 });
    await seedOrder(raw, { orderId: 701, ownerUserId: A.profileId, providerId: SHELTER, kind: 'donation', amountCents: 2000 });
    // A (the payer) reads both.
    await asApp(A.profileId, async (tx) => {
      const rows = await tx`select id, kind from orders order by id`;
      expect(ids(rows)).toEqual([700, 701]);
    });
    // Shelter staff read them (incoming fee + donation to their place).
    await asApp(SSTF.profileId, async (tx) => {
      expect(ids(await tx`select id from orders`)).toEqual([700, 701]);
    });
    // A different provider reads none.
    await asApp(SQ.profileId, async (tx) => {
      expect(await tx`select id from orders`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. approval → adopter pet creation (app_approve_adoption).
describe('2.12 — approval → adopter pet creation (the transfer)', () => {
  beforeEach(async () => {
    await seedAdoptionApplication(raw, { applicationId: APP_A, listingId: LISTING, providerId: SHELTER, applicantUserId: A.profileId });
    // The seed helpers insert pets with EXPLICIT ids (1,2) which do not advance the identity
    // sequence; app_approve_adoption inserts a pet with NO id, so without this the generated
    // id would collide with the seeded pets. Advance the sequence past the seeded rows (this
    // mirrors what a real DB does once normal auto-id inserts have run).
    await raw`select setval(pg_get_serial_sequence('pets','id'), (select max(id) from pets))`;
  });

  it('shelter staff approval creates a NEW pet owned by the APPLICANT + marks listing adopted', async () => {
    let newPetId: number | null = null;
    await asApp(SSTF.profileId, async (tx) => {
      const [{ pet_id }] = await tx`select app_approve_adoption(${APP_A}) as pet_id`;
      newPetId = pet_id;
      expect(pet_id).not.toBeNull();
    });
    // The new pet is owned by the applicant (A) — verify with the privileged client.
    const petRows = await raw`select id, owner_user_id, name from pets where id = ${newPetId}`;
    expect(petRows).toHaveLength(1);
    expect(petRows[0].owner_user_id).toBe(A.profileId);
    // The application is approved + linked; the listing is adopted.
    const [appRow] = await raw`select status, transferred_pet_id from adoption_applications where id = ${APP_A}`;
    expect(appRow.status).toBe('approved');
    expect(appRow.transferred_pet_id).toBe(newPetId);
    const [listingRow] = await raw`select status from adoptable_listings where id = ${LISTING}`;
    expect(listingRow.status).toBe('adopted');
  });

  it('the adopter (A) OWNS + can MANAGE their newly transferred pet under owner RLS', async () => {
    let newPetId: number | null = null;
    await asApp(SSTF.profileId, async (tx) => {
      const [{ pet_id }] = await tx`select app_approve_adoption(${APP_A}) as pet_id`;
      newPetId = pet_id;
    });
    // A can read AND mutate the pet (the owner_all policy) — it's a normal pet of theirs now.
    await asApp(A.profileId, async (tx) => {
      const rows = await tx`select id from pets where id = ${newPetId}`;
      expect(rows).toHaveLength(1);
      const upd = await tx`update pets set notes = 'home now' where id = ${newPetId} returning id`;
      expect(upd).toHaveLength(1);
    });
    // B (another owner) can READ the profile — pets are socially readable by any authed user
    // (the feed) — but CANNOT mutate it (writes stay owner-only): zero rows updated.
    await asApp(B.profileId, async (tx) => {
      const upd = await tx`update pets set notes = 'forged' where id = ${newPetId} returning id`;
      expect(upd).toHaveLength(0);
    });
  });

  it('a non-staff caller cannot approve (returns NULL; no pet, no status change)', async () => {
    await asApp(A.profileId, async (tx) => {
      const [{ pet_id }] = await tx`select app_approve_adoption(${APP_A}) as pet_id`;
      expect(pet_id).toBeNull();
    });
    await asApp(SQ.profileId, async (tx) => {
      const [{ pet_id }] = await tx`select app_approve_adoption(${APP_A}) as pet_id`;
      expect(pet_id).toBeNull();
    });
    const [appRow] = await raw`select status from adoption_applications where id = ${APP_A}`;
    expect(appRow.status).toBe('submitted'); // unchanged
  });

  it('an already-decided application is not re-approvable', async () => {
    await asApp(SSTF.profileId, async (tx) => {
      await tx`select app_approve_adoption(${APP_A})`; // first approval
      const [{ pet_id }] = await tx`select app_approve_adoption(${APP_A}) as pet_id`; // second
      expect(pet_id).toBeNull();
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. completeness guard.
describe('2.12 — completeness: adoption tables are ENABLE+FORCE RLS with policies', () => {
  it('adoptable_listings / adoption_applications / adoption_favorites are policied', async () => {
    const rows = await raw<
      { table: string; enabled: boolean; forced: boolean; policies: number }[]
    >`
      select c.relname as table,
             c.relrowsecurity as enabled,
             c.relforcerowsecurity as forced,
             (select count(*) from pg_policies p
               where p.schemaname = 'public' and p.tablename = c.relname)::int as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname in ('adoptable_listings','adoption_applications','adoption_favorites')
      order by c.relname
    `;
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.enabled, `${r.table} must ENABLE RLS`).toBe(true);
      expect(r.forced, `${r.table} must FORCE RLS`).toBe(true);
      expect(r.policies, `${r.table} must carry ≥1 policy`).toBeGreaterThan(0);
    }
  });
});
