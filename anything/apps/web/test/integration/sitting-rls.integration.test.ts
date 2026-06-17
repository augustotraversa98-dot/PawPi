// Ticket 2.9 — PET SITTING module, proven on the REAL tables acting AS pawpi_app.
// Companion to the R2 suites + grooming (2.6) + walking (2.7) + daycare (2.8). 0035 adds:
//   * vet_appointments.meet_and_greet — the lightweight pre-booking INTRO flag
//   * sitting_visits — owner FOR ALL + ASSIGNED-sitter (participant-scoped) RLS, the crux
//     of this ticket and the guard that VISIT MEDIA never leaks to a non-participant.
//
// What this proves (as pawpi_app, NOBYPASSRLS, identity stamped per transaction):
//   1. The capability GATE: provider_has_capability(provider, 'sitter') is the exact
//      predicate requireProviderCapability uses — a NON-sitter provider resolves false
//      (the app layer turns that into a 403), a sitter provider resolves true.
//   2. sitting_visits is visible to the OWNER and to the ASSIGNED active sitter — and to NO
//      ONE ELSE: an outsider, another owner, AND another sitter of the SAME provider all
//      read ZERO. This is the VISIT-MEDIA participant guard (the ticket's DO-NOT: "visit
//      media not exposed to non-participants").
//   3. The assigned sitter can INSERT/UPDATE (log + edit a visit, append media); a
//      non-assigned sitter and an outsider cannot; a removed staff member loses access.
//   4. MEET-AND-GREET: the flag rides the booking RLS unchanged — an owner books a sitter
//      booking with meet_and_greet=true and reads it back; the booking lifecycle is intact.
//   5. RECURRING DROP-INS: a recurrence_rule booking (capability 'sitter') is one booking;
//      each materialised visit is one sitting_visits row, all owner-visible.
//   6. The completeness guard: sitting_visits is ENABLE+FORCE RLS with policies.
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
  seedGeneralBooking,
  seedSittingVisit,
} from './db';

// O = pet owner. S = the ASSIGNED active sitter-staff. S2 = ANOTHER active sitter of the
// same provider (NOT assigned — must read zero). X = authed outsider.
const O = { authUserId: 1, profileId: 1, username: 'ownero', petId: 1, petName: 'Rex' };
const S = { authUserId: 2, profileId: 2, username: 'sitters' };
const S2 = { authUserId: 3, profileId: 3, username: 'sitters2' };
const X = { authUserId: 4, profileId: 4, username: 'outsiderx' };
const SITTER_ID = 10; // a provider that HOLDS the 'sitter' capability
const VET_ONLY_ID = 11; // a provider that does NOT hold 'sitter'
const VISIT_ID = 100;

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

// O owns a pet; a SITTER provider with S + S2 as active staff (+ a vet-only provider for
// the capability-gate negative); an active health_logs_write grant for (pet, sitter); one
// completed visit ASSIGNED to S.
beforeEach(async () => {
  await seedOwnerWithPet(raw, O);
  await seedUser(raw, S);
  await seedUser(raw, S2);
  await seedUser(raw, X);
  await seedProvider(raw, {
    providerId: SITTER_ID,
    ownerUserProfileId: S.profileId,
    slug: 'cozy-sits',
    status: 'published',
  });
  await seedStaff(raw, { providerId: SITTER_ID, userProfileId: S.profileId, role: 'owner' });
  await seedStaff(raw, { providerId: SITTER_ID, userProfileId: S2.profileId, role: 'staff' });
  await seedCapability(raw, { providerId: SITTER_ID, capability: 'sitter' });
  // A second provider that holds vet but NOT sitter (the capability-gate negative).
  await seedProvider(raw, {
    providerId: VET_ONLY_ID,
    ownerUserProfileId: S.profileId,
    slug: 'vet-only',
    status: 'published',
  });
  await seedCapability(raw, { providerId: VET_ONLY_ID, capability: 'vet' });
  // The owner granted the sitter health_logs_write.
  await seedGrant(raw, {
    petId: O.petId,
    ownerUserId: O.profileId,
    providerId: SITTER_ID,
    scopes: ['health_logs_write'],
    status: 'active',
  });
  // The logged visit, assigned to S, with media.
  await seedSittingVisit(raw, {
    visitId: VISIT_ID,
    petId: O.petId,
    ownerUserId: O.profileId,
    providerId: SITTER_ID,
    staffUserId: S.profileId,
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.9 — capability gate (provider_has_capability, as pawpi_app)', () => {
  it("a SITTER provider resolves 'sitter' = true (gate passes)", async () => {
    await asApp(S.profileId, async (tx) => {
      const r = await tx`select provider_has_capability(${SITTER_ID}, 'sitter') as has`;
      expect(r[0].has).toBe(true);
    });
  });

  it("a NON-sitter provider resolves 'sitter' = false (route → 403)", async () => {
    await asApp(S.profileId, async (tx) => {
      const r = await tx`select provider_has_capability(${VET_ONLY_ID}, 'sitter') as has`;
      expect(r[0].has).toBe(false);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.9 — sitting_visits read RLS — the VISIT-MEDIA participant guard (as pawpi_app)', () => {
  it('owner O sees their pet visit (the updates feed + media)', async () => {
    await asApp(O.profileId, async (tx) => {
      expect(ids(await tx`select id from sitting_visits`)).toEqual([VISIT_ID]);
    });
  });

  it('the ASSIGNED sitter S sees the visit (the update they posted)', async () => {
    await asApp(S.profileId, async (tx) => {
      expect(ids(await tx`select id from sitting_visits`)).toEqual([VISIT_ID]);
    });
  });

  it('ANOTHER sitter (S2) of the SAME provider sees ZERO — visit media is participant-only', async () => {
    await asApp(S2.profileId, async (tx) => {
      expect(await tx`select id from sitting_visits`).toHaveLength(0);
    });
  });

  it('an authed outsider X sees zero visits (incl. its photo/video URLs)', async () => {
    await asApp(X.profileId, async (tx) => {
      expect(
        await tx`select id, photo_urls, video_urls from sitting_visits`,
      ).toHaveLength(0);
    });
  });

  it('no identity → zero visits', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from sitting_visits`).toHaveLength(0);
    });
  });

  it('the assigned sitter loses access the instant their staff row flips to removed', async () => {
    await raw`update provider_staff set status = 'removed' where provider_id = ${SITTER_ID} and user_profile_id = ${S.profileId}`;
    await asApp(S.profileId, async (tx) => {
      expect(await tx`select id from sitting_visits`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.9 — sitting_visits write RLS (log + edit a visit, as pawpi_app)', () => {
  it('the ASSIGNED sitter can INSERT a visit (log an update)', async () => {
    await asApp(S.profileId, async (tx) => {
      const created = await tx`
        insert into sitting_visits
          (pet_id, owner_user_id, provider_id, staff_user_id, status, notes, photo_urls)
        values (${O.petId}, ${O.profileId}, ${SITTER_ID}, ${S.profileId}, 'completed',
                'Evening drop-in', array['p.jpg'])
        returning id
      `;
      expect(created).toHaveLength(1);
    });
  });

  it('a sitter CANNOT log a visit assigned to ANOTHER sitter (WITH CHECK reject)', async () => {
    await expect(
      asApp(S.profileId, (tx) => tx`
        insert into sitting_visits
          (pet_id, owner_user_id, provider_id, staff_user_id, status)
        values (${O.petId}, ${O.profileId}, ${SITTER_ID}, ${S2.profileId}, 'completed')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('an outsider CANNOT log a visit', async () => {
    await expect(
      asApp(X.profileId, (tx) => tx`
        insert into sitting_visits
          (pet_id, owner_user_id, provider_id, staff_user_id, status)
        values (${O.petId}, ${O.profileId}, ${SITTER_ID}, ${X.profileId}, 'completed')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('the ASSIGNED sitter can UPDATE their visit (append media / finish)', async () => {
    await asApp(S.profileId, async (tx) => {
      const updated = await tx`
        update sitting_visits set notes = 'Updated', photo_urls = array['a.jpg','b.jpg']
        where id = ${VISIT_ID} returning id
      `;
      expect(updated).toHaveLength(1);
    });
  });

  it('a non-assigned sitter (S2) UPDATEs ZERO of the visit', async () => {
    await asApp(S2.profileId, async (tx) => {
      expect(
        await tx`update sitting_visits set notes = 'hijack' returning id`,
      ).toHaveLength(0);
    });
    const [{ n }] = await raw`select notes as n from sitting_visits where id = ${VISIT_ID}`;
    expect(n).toBeNull(); // untouched (seed left notes null)
  });

  it('the owner can update their own visit (cancel/correct)', async () => {
    await asApp(O.profileId, async (tx) => {
      const updated = await tx`
        update sitting_visits set status = 'cancelled'
        where id = ${VISIT_ID} returning id
      `;
      expect(updated).toHaveLength(1);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.9 — meet-and-greet (the pre-booking flag rides the booking RLS)', () => {
  it('an owner books a SITTER booking with meet_and_greet=true and reads it back', async () => {
    await seedGeneralBooking(raw, {
      apptId: 500,
      petId: O.petId,
      ownerUserId: O.profileId,
      providerId: SITTER_ID,
      capability: 'sitter',
      meetAndGreet: true,
    });
    await asApp(O.profileId, async (tx) => {
      const rows = await tx<{ id: number; meet_and_greet: boolean }[]>`
        select id, meet_and_greet from vet_appointments where id = 500
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0].meet_and_greet).toBe(true);
    });
  });

  it('an outsider cannot read the meet-and-greet booking (booking RLS unchanged)', async () => {
    await seedGeneralBooking(raw, {
      apptId: 501,
      petId: O.petId,
      ownerUserId: O.profileId,
      providerId: SITTER_ID,
      capability: 'sitter',
      meetAndGreet: true,
    });
    await asApp(X.profileId, async (tx) => {
      expect(await tx`select id from vet_appointments where id = 501`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.9 — recurring drop-ins (one booking, many owner-visible visits)', () => {
  it('a recurrence_rule sitter booking is one booking; each materialised visit is owner-visible', async () => {
    // The recurring drop-in pack is ONE booking carrying an RRULE (2.4 recurrence).
    await seedGeneralBooking(raw, {
      apptId: 600,
      petId: O.petId,
      ownerUserId: O.profileId,
      providerId: SITTER_ID,
      capability: 'sitter',
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    });
    // Two drop-in visits materialised against that booking, both assigned to S.
    await seedSittingVisit(raw, {
      visitId: 601,
      petId: O.petId,
      ownerUserId: O.profileId,
      providerId: SITTER_ID,
      staffUserId: S.profileId,
      bookingId: 600,
    });
    await seedSittingVisit(raw, {
      visitId: 602,
      petId: O.petId,
      ownerUserId: O.profileId,
      providerId: SITTER_ID,
      staffUserId: S.profileId,
      bookingId: 600,
    });
    await asApp(O.profileId, async (tx) => {
      const rows = await tx<{ id: number }[]>`
        select id from sitting_visits where booking_id = 600
      `;
      expect(ids(rows)).toEqual([601, 602]);
    });
    // And those drop-in visits stay participant-only — another sitter sees none.
    await asApp(S2.profileId, async (tx) => {
      expect(
        await tx`select id from sitting_visits where booking_id = 600`,
      ).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.9 — completeness: sitting_visits is ENABLE+FORCE RLS with policies', () => {
  it('sitting_visits is policied (the model cannot silently regress)', async () => {
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
        and c.relname = 'sitting_visits'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled, 'sitting_visits must ENABLE RLS').toBe(true);
    expect(rows[0].forced, 'sitting_visits must FORCE RLS').toBe(true);
    expect(rows[0].policies, 'sitting_visits must carry ≥1 policy').toBeGreaterThan(0);
  });
});
