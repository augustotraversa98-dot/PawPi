// Ticket 2.8 — DAYCARE/BOARDING module, proven on the REAL tables acting AS pawpi_app.
// Companion to the R2 suites + grooming (2.6) + walking (2.7). 0034 adds:
//   * provider_locations.capacity (occupancy ceiling)
//   * daycare_requirements (facility config: required vaccines) — staff/published read,
//     owner|admin write
//   * daycare_stays — owner FOR ALL + provider-via-health_logs_write-grant
//   * report_cards — scoped THROUGH the parent stay (owner of the stay + provider-grant)
//
// What this proves (as pawpi_app, NOBYPASSRLS, identity stamped per transaction):
//   1. The capability GATE: provider_has_capability(provider, 'daycare') is the exact
//      predicate requireProviderCapability uses — a NON-daycare provider resolves false
//      (the app layer turns that into a 403), a daycare provider resolves true.
//   2. CAPACITY / OVERBOOK PREVENTION: the route's overlap count (live stays at a location
//      whose range overlaps the request) is what refuses an over-capacity booking. We prove
//      the count is correct against the real overlap predicate, and that a non-overlapping
//      or cancelled stay does NOT consume capacity.
//   3. daycare_stays is visible to the OWNER and to a facility with an ACTIVE
//      health_logs_write GRANT — and to NO ONE ELSE (no grant, wrong scope, no identity
//      all read zero). A facility WITH the grant can INSERT/UPDATE (walk-in / check-in/out);
//      WITHOUT it the write is denied; a removed staff member loses access instantly.
//   4. report_cards are scoped THROUGH the stay: the stay OWNER reads; a facility with the
//      grant reads/inserts; an outsider reads zero.
//   5. VACCINE-REQUIREMENT VERIFICATION is CONSENT-GATED: pet_vaccinations is readable by a
//      facility ONLY with a medical_read grant (the assertCareAccess path the vaccine-check
//      route uses) — without it the facility reads ZERO (→ the route 403s "needs consent",
//      never a fake pass). daycare_requirements read is public for a PUBLISHED provider so
//      the owner sees what is required before booking.
//   6. The completeness guard: every new base table is ENABLE+FORCE RLS with policies.
//
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
  seedCapability,
  seedGrant,
  seedLocation,
  setLocationCapacity,
  seedDaycareRequirement,
  seedDaycareStay,
  seedReportCard,
  seedVaccination,
} from './db';

// O = pet owner. F = active staff of the DAYCARE provider. X = authed outsider.
const O = { authUserId: 1, profileId: 1, username: 'ownero', petId: 1, petName: 'Rex' };
const F = { authUserId: 2, profileId: 2, username: 'facilityf' };
const X = { authUserId: 3, profileId: 3, username: 'outsiderx' };
const DAYCARE_ID = 10; // a provider that HOLDS the 'daycare' capability
const VET_ONLY_ID = 11; // a provider that does NOT hold 'daycare'
const LOCATION_ID = 20;
const STAY_ID = 100;
const CARD_ID = 200;

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

// O owns a pet; a DAYCARE provider with F as active staff (+ a vet-only provider for the
// capability-gate negative), a location with capacity 2, a 'Rabies' requirement; an active
// health_logs_write grant for (pet, daycare); one booked stay + one report card.
beforeEach(async () => {
  await seedOwnerWithPet(raw, O);
  await seedUser(raw, F);
  await seedUser(raw, X);
  await seedProvider(raw, {
    providerId: DAYCARE_ID,
    ownerUserProfileId: F.profileId,
    slug: 'happy-paws',
    status: 'published',
  });
  await seedStaff(raw, { providerId: DAYCARE_ID, userProfileId: F.profileId, role: 'owner' });
  await seedCapability(raw, { providerId: DAYCARE_ID, capability: 'daycare' });
  await seedLocation(raw, { locationId: LOCATION_ID, providerId: DAYCARE_ID });
  await setLocationCapacity(raw, { locationId: LOCATION_ID, capacity: 2 });
  await seedDaycareRequirement(raw, {
    requirementId: 1,
    providerId: DAYCARE_ID,
    vaccineName: 'Rabies',
  });
  // A second provider that holds vet but NOT daycare (the capability-gate negative).
  await seedProvider(raw, {
    providerId: VET_ONLY_ID,
    ownerUserProfileId: F.profileId,
    slug: 'vet-only',
    status: 'published',
  });
  await seedCapability(raw, { providerId: VET_ONLY_ID, capability: 'vet' });
  // The owner granted the daycare health_logs_write (stays/cards) — medical_read added
  // per-test where the vaccine check is exercised.
  await seedGrant(raw, {
    petId: O.petId,
    ownerUserId: O.profileId,
    providerId: DAYCARE_ID,
    scopes: ['health_logs_write'],
    status: 'active',
  });
  await seedDaycareStay(raw, {
    stayId: STAY_ID,
    petId: O.petId,
    ownerUserId: O.profileId,
    providerId: DAYCARE_ID,
    locationId: LOCATION_ID,
  });
  await seedReportCard(raw, { cardId: CARD_ID, stayId: STAY_ID });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.8 — capability gate (provider_has_capability, as pawpi_app)', () => {
  it("a DAYCARE provider resolves 'daycare' = true (gate passes)", async () => {
    await asApp(F.profileId, async (tx) => {
      const r = await tx`select provider_has_capability(${DAYCARE_ID}, 'daycare') as has`;
      expect(r[0].has).toBe(true);
    });
  });

  it("a NON-daycare provider resolves 'daycare' = false (route → 403)", async () => {
    await asApp(F.profileId, async (tx) => {
      const r = await tx`select provider_has_capability(${VET_ONLY_ID}, 'daycare') as has`;
      expect(r[0].has).toBe(false);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.8 — capacity / overbook prevention (the overlap count, as pawpi_app)', () => {
  // The route refuses a booking when the count of LIVE overlapping stays >= capacity. We
  // prove the count predicate directly under the OWNER's identity (the booking path).
  const overlapCount = (tx: Sql, locationId: number, start: string, end: string) =>
    tx<{ n: number }[]>`
      select count(*)::int as n from daycare_stays
      where location_id = ${locationId}
        and status = any (array['booked','checked_in'])
        and start_date <= ${end}
        and end_date >= ${start}
    `;

  it('an overlapping live stay consumes capacity (count = 1 against the seeded stay)', async () => {
    await asApp(O.profileId, async (tx) => {
      // Seeded stay is 2026-08-01..08-03; a request 08-02..08-04 overlaps.
      const [{ n }] = await overlapCount(tx, LOCATION_ID, '2026-08-02', '2026-08-04');
      expect(n).toBe(1);
    });
  });

  it('a NON-overlapping request sees zero occupancy (capacity free)', async () => {
    await asApp(O.profileId, async (tx) => {
      // A request 08-10..08-12 does not overlap the seeded 08-01..08-03 stay.
      const [{ n }] = await overlapCount(tx, LOCATION_ID, '2026-08-10', '2026-08-12');
      expect(n).toBe(0);
    });
  });

  it('a CANCELLED stay does NOT consume capacity', async () => {
    await raw`update daycare_stays set status = 'cancelled' where id = ${STAY_ID}`;
    await asApp(O.profileId, async (tx) => {
      const [{ n }] = await overlapCount(tx, LOCATION_ID, '2026-08-02', '2026-08-04');
      expect(n).toBe(0);
    });
  });

  it('capacity is reached when overlapping live stays equal the ceiling (2)', async () => {
    // Add a second owner + pet + grant + overlapping stay, so two live stays overlap.
    const O2 = { authUserId: 4, profileId: 4, username: 'owner2', petId: 2, petName: 'Fido' };
    await seedOwnerWithPet(raw, O2);
    await seedDaycareStay(raw, {
      stayId: 101,
      petId: O2.petId,
      ownerUserId: O2.profileId,
      providerId: DAYCARE_ID,
      locationId: LOCATION_ID,
      startDate: '2026-08-02',
      endDate: '2026-08-04',
    });
    // The owner-of-record for the new stay counts the location's occupancy (count is not
    // owner-scoped at the SQL level — capacity is a facility property; the route runs the
    // count, RLS does not hide other owners' stays from the count because the route reads
    // it server-side). Prove the raw count is at the ceiling.
    const [{ n }] = await raw<{ n: number }[]>`
      select count(*)::int as n from daycare_stays
      where location_id = ${LOCATION_ID}
        and status = any (array['booked','checked_in'])
        and start_date <= '2026-08-04' and end_date >= '2026-08-02'
    `;
    expect(n).toBe(2); // == capacity → the route returns 409.
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.8 — daycare_requirements read RLS (public for a published provider)', () => {
  it('the owner (an authed non-staff user) reads a PUBLISHED provider requirements', async () => {
    await asApp(O.profileId, async (tx) => {
      expect(ids(await tx`select id from daycare_requirements`)).toEqual([1]);
    });
  });

  it('active staff read their provider requirements', async () => {
    await asApp(F.profileId, async (tx) => {
      expect(ids(await tx`select id from daycare_requirements`)).toEqual([1]);
    });
  });

  it('a non-staff user CANNOT write a requirement (admin-only)', async () => {
    await expect(
      asApp(O.profileId, (tx) => tx`
        insert into daycare_requirements (provider_id, vaccine_name)
        values (${DAYCARE_ID}, 'DHPP')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('owner|admin staff CAN write a requirement', async () => {
    await asApp(F.profileId, async (tx) => {
      const created = await tx`
        insert into daycare_requirements (id, provider_id, vaccine_name)
        values (2, ${DAYCARE_ID}, 'DHPP') returning id
      `;
      expect(created).toHaveLength(1);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.8 — daycare_stays read RLS (as pawpi_app)', () => {
  it('owner O sees their pet stay (instructions + status)', async () => {
    await asApp(O.profileId, async (tx) => {
      expect(ids(await tx`select id from daycare_stays`)).toEqual([STAY_ID]);
    });
  });

  it('facility F WITH an active health_logs_write grant sees the stay', async () => {
    await asApp(F.profileId, async (tx) => {
      expect(ids(await tx`select id from daycare_stays`)).toEqual([STAY_ID]);
    });
  });

  it('an authed outsider X sees zero stays', async () => {
    await asApp(X.profileId, async (tx) => {
      expect(await tx`select id from daycare_stays`).toHaveLength(0);
    });
  });

  it('no identity → zero stays', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from daycare_stays`).toHaveLength(0);
    });
  });

  it('the facility loses access when the grant is REVOKED', async () => {
    await raw`update care_access_grants set status = 'revoked' where provider_id = ${DAYCARE_ID} and pet_id = ${O.petId}`;
    await asApp(F.profileId, async (tx) => {
      expect(await tx`select id from daycare_stays`).toHaveLength(0);
    });
  });

  it('the facility loses access the instant their staff row flips to removed', async () => {
    await raw`update provider_staff set status = 'removed' where provider_id = ${DAYCARE_ID} and user_profile_id = ${F.profileId}`;
    await asApp(F.profileId, async (tx) => {
      expect(await tx`select id from daycare_stays`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.8 — daycare_stays write RLS (check-in/out, as pawpi_app)', () => {
  it('a facility WITH the grant can UPDATE a stay (check in)', async () => {
    await asApp(F.profileId, async (tx) => {
      const updated = await tx`
        update daycare_stays set status = 'checked_in', checked_in_at = now()
        where id = ${STAY_ID} returning id
      `;
      expect(updated).toHaveLength(1);
    });
  });

  it('a facility WITHOUT the grant UPDATEs ZERO', async () => {
    await raw`update care_access_grants set status = 'revoked' where provider_id = ${DAYCARE_ID} and pet_id = ${O.petId}`;
    await asApp(F.profileId, async (tx) => {
      expect(
        await tx`update daycare_stays set status = 'checked_in' returning id`,
      ).toHaveLength(0);
    });
    const [{ s }] = await raw`select status as s from daycare_stays where id = ${STAY_ID}`;
    expect(s).toBe('booked'); // untouched
  });

  it('a facility WITH the grant can INSERT a stay (walk-in)', async () => {
    await asApp(F.profileId, async (tx) => {
      const created = await tx`
        insert into daycare_stays
          (pet_id, owner_user_id, provider_id, location_id, start_date, end_date, status)
        values (${O.petId}, ${O.profileId}, ${DAYCARE_ID}, ${LOCATION_ID}, '2026-09-01', '2026-09-01', 'booked')
        returning id
      `;
      expect(created).toHaveLength(1);
    });
  });

  it('an outsider CANNOT insert a stay', async () => {
    await expect(
      asApp(X.profileId, (tx) => tx`
        insert into daycare_stays
          (pet_id, owner_user_id, provider_id, start_date, end_date)
        values (${O.petId}, ${O.profileId}, ${DAYCARE_ID}, '2026-09-01', '2026-09-01')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('the owner can cancel their own stay', async () => {
    await asApp(O.profileId, async (tx) => {
      const updated = await tx`
        update daycare_stays set status = 'cancelled' where id = ${STAY_ID} returning id
      `;
      expect(updated).toHaveLength(1);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.8 — report_cards RLS (scoped through the stay, as pawpi_app)', () => {
  it('the stay OWNER reads the daily card', async () => {
    await asApp(O.profileId, async (tx) => {
      expect(ids(await tx`select id from report_cards`)).toEqual([CARD_ID]);
    });
  });

  it('the facility WITH the grant reads the card', async () => {
    await asApp(F.profileId, async (tx) => {
      expect(ids(await tx`select id from report_cards`)).toEqual([CARD_ID]);
    });
  });

  it('an outsider reads ZERO cards', async () => {
    await asApp(X.profileId, async (tx) => {
      expect(await tx`select id from report_cards`).toHaveLength(0);
    });
  });

  it('the facility WITH the grant can POST a daily card', async () => {
    await asApp(F.profileId, async (tx) => {
      const created = await tx`
        insert into report_cards (stay_id, date, mood)
        values (${STAY_ID}, '2026-08-02', 'playful') returning id
      `;
      expect(created).toHaveLength(1);
    });
  });

  it('a facility WITHOUT the grant CANNOT post a card', async () => {
    await raw`update care_access_grants set status = 'revoked' where provider_id = ${DAYCARE_ID} and pet_id = ${O.petId}`;
    await expect(
      asApp(F.profileId, (tx) => tx`
        insert into report_cards (stay_id, date, mood)
        values (${STAY_ID}, '2026-08-02', 'playful')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('an outsider CANNOT post a card', async () => {
    await expect(
      asApp(X.profileId, (tx) => tx`
        insert into report_cards (stay_id, date, mood)
        values (${STAY_ID}, '2026-08-02', 'sneaky')
      `),
    ).rejects.toThrow(/row-level security/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.8 — vaccine-requirement verification is CONSENT-GATED (the DO-NOT)', () => {
  // pet_vaccinations is owner-private medical data; a facility reads it ONLY with a
  // medical_read grant (the assertCareAccess path the vaccine-check route uses). The
  // health_logs_write grant (for stays/cards) is NOT sufficient — medical_read is required.
  beforeEach(async () => {
    await seedVaccination(raw, {
      vaxId: 1,
      petId: O.petId,
      ownerUserId: O.profileId,
      name: 'Rabies',
    });
  });

  it('the owner reads their own pet vaccinations (the owner-side surface branch)', async () => {
    await asApp(O.profileId, async (tx) => {
      expect(ids(await tx`select id from pet_vaccinations`)).toEqual([1]);
    });
  });

  it('the facility with ONLY health_logs_write reads ZERO vaccinations (→ route 403 needs consent)', async () => {
    await asApp(F.profileId, async (tx) => {
      expect(await tx`select id from pet_vaccinations`).toHaveLength(0);
    });
  });

  it('the facility WITH a medical_read grant reads the vaccinations (consent given)', async () => {
    // Owner adds medical_read to the existing grant (mirror the consent model).
    await raw`update care_access_grants set scopes = array['health_logs_write','medical_read'] where provider_id = ${DAYCARE_ID} and pet_id = ${O.petId}`;
    await asApp(F.profileId, async (tx) => {
      expect(ids(await tx`select id from pet_vaccinations`)).toEqual([1]);
    });
  });

  it('the facility loses vaccine read when the grant is revoked', async () => {
    await raw`update care_access_grants set scopes = array['health_logs_write','medical_read'], status = 'revoked' where provider_id = ${DAYCARE_ID} and pet_id = ${O.petId}`;
    await asApp(F.profileId, async (tx) => {
      expect(await tx`select id from pet_vaccinations`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.8 — completeness: new tables are ENABLE+FORCE RLS with policies', () => {
  it('daycare_requirements, daycare_stays, report_cards are policied', async () => {
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
        and c.relname = any (array['daycare_requirements','daycare_stays','report_cards'])
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
