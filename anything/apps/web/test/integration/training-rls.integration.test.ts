// Ticket 2.10 — TRAINING module, proven on the REAL tables acting AS pawpi_app.
// Companion to grooming (2.6) / walking (2.7) / daycare (2.8) / sitting (2.9). 0036 adds
// three tables — training_programs, training_sessions, training_progress — for the PROVIDER
// training service (hiring a trainer), DISTINCT from the consumer self-Training tab.
//
// What this proves (as pawpi_app, NOBYPASSRLS, identity stamped per transaction):
//   1. The capability GATE: provider_has_capability(provider, 'trainer') is the exact
//      predicate requireProviderCapability uses — a NON-trainer resolves false (→ 403), a
//      trainer resolves true.
//   2. training_programs / training_progress are OWNER-FOR-ALL + provider-via-grant: the
//      owner sees their OWN pet's enrollment + progress + video lessons; the trainer sees
//      them ONLY through an active health_logs_write grant; an outsider / another owner read
//      ZERO (the ticket's "owner sees own pet's progress only").
//   3. training_sessions is staff-manage + published-public: a trainer's published group
//      classes are browseable by any authed owner (to join); writes require active staff.
//   4. The trainer can INSERT/UPDATE progress (log attendance + notes + video) only with a
//      grant; without the grant (or removed staff) → ZERO.
//   5. GROUP-CLASS CAPACITY: the count-based guard (live attendees of a class) is the same
//      shape daycare occupancy uses (the route refuses at capacity).
//   6. The completeness guard: all three tables are ENABLE+FORCE RLS with policies.
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
  seedTrainingProgram,
  seedTrainingSession,
  seedTrainingProgress,
} from './db';

// O = pet owner. T = the trainer-staff with a grant. O2 = ANOTHER owner+pet (must read
// ZERO of O's data). X = authed outsider (no provider, no grant).
const O = { authUserId: 1, profileId: 1, username: 'ownero', petId: 1, petName: 'Rex' };
const T = { authUserId: 2, profileId: 2, username: 'trainert' };
const O2 = { authUserId: 3, profileId: 3, username: 'ownero2', petId: 3, petName: 'Spot' };
const X = { authUserId: 4, profileId: 4, username: 'outsiderx' };
const TRAINER_ID = 10; // a provider that HOLDS the 'trainer' capability
const VET_ONLY_ID = 11; // a provider that does NOT hold 'trainer'
const PROGRAM_ID = 100;
const SESSION_ID = 200; // a group class
const PROGRESS_ID = 300; // O's pet's progress on the class

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

// O owns a pet; a TRAINER provider with T as active staff (+ a vet-only provider for the
// capability-gate negative); an active health_logs_write grant for (pet, trainer); one
// program enrollment, one published group class, and O's pet's progress on that class.
beforeEach(async () => {
  await seedOwnerWithPet(raw, O);
  await seedUser(raw, T);
  await seedOwnerWithPet(raw, O2);
  await seedUser(raw, X);
  await seedProvider(raw, {
    providerId: TRAINER_ID,
    ownerUserProfileId: T.profileId,
    slug: 'pawsitive-training',
    status: 'published',
  });
  await seedStaff(raw, { providerId: TRAINER_ID, userProfileId: T.profileId, role: 'owner' });
  await seedCapability(raw, { providerId: TRAINER_ID, capability: 'trainer' });
  // A second provider that holds vet but NOT trainer (the capability-gate negative).
  await seedProvider(raw, {
    providerId: VET_ONLY_ID,
    ownerUserProfileId: T.profileId,
    slug: 'vet-only',
    status: 'published',
  });
  await seedCapability(raw, { providerId: VET_ONLY_ID, capability: 'vet' });
  // The owner granted the trainer health_logs_write.
  await seedGrant(raw, {
    petId: O.petId,
    ownerUserId: O.profileId,
    providerId: TRAINER_ID,
    scopes: ['health_logs_write'],
    status: 'active',
  });
  // A program enrollment + a published group class (capacity 2) + O's pet's progress on it.
  await seedTrainingProgram(raw, {
    programId: PROGRAM_ID,
    petId: O.petId,
    ownerUserId: O.profileId,
    providerId: TRAINER_ID,
  });
  await seedTrainingSession(raw, {
    sessionId: SESSION_ID,
    providerId: TRAINER_ID,
    kind: 'group_class',
    capacity: 2,
  });
  await seedTrainingProgress(raw, {
    progressId: PROGRESS_ID,
    sessionId: SESSION_ID,
    petId: O.petId,
    ownerUserId: O.profileId,
    providerId: TRAINER_ID,
    progressNote: 'Great recall today',
    status: 'completed',
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.10 — capability gate (provider_has_capability, as pawpi_app)', () => {
  it("a TRAINER provider resolves 'trainer' = true (gate passes)", async () => {
    await asApp(T.profileId, async (tx) => {
      const r = await tx`select provider_has_capability(${TRAINER_ID}, 'trainer') as has`;
      expect(r[0].has).toBe(true);
    });
  });

  it("a NON-trainer provider resolves 'trainer' = false (route → 403)", async () => {
    await asApp(T.profileId, async (tx) => {
      const r = await tx`select provider_has_capability(${VET_ONLY_ID}, 'trainer') as has`;
      expect(r[0].has).toBe(false);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.10 — training_programs RLS (owner FOR ALL + provider via grant, as pawpi_app)', () => {
  it('owner O sees their pet enrollment + video lessons', async () => {
    await asApp(O.profileId, async (tx) => {
      const rows = await tx<{ id: number; video_lesson_urls: string[] }[]>`
        select id, video_lesson_urls from training_programs
      `;
      expect(ids(rows)).toEqual([PROGRAM_ID]);
      expect(rows[0].video_lesson_urls.length).toBeGreaterThan(0);
    });
  });

  it('the trainer T (active grant) sees the enrollment', async () => {
    await asApp(T.profileId, async (tx) => {
      expect(ids(await tx`select id from training_programs`)).toEqual([PROGRAM_ID]);
    });
  });

  it('ANOTHER owner O2 sees ZERO of O\'s programs', async () => {
    await asApp(O2.profileId, async (tx) => {
      expect(await tx`select id from training_programs`).toHaveLength(0);
    });
  });

  it('an authed outsider X sees zero programs', async () => {
    await asApp(X.profileId, async (tx) => {
      expect(await tx`select id from training_programs`).toHaveLength(0);
    });
  });

  it('the trainer loses access the instant their grant is revoked', async () => {
    await raw`update care_access_grants set status = 'revoked' where pet_id = ${O.petId} and provider_id = ${TRAINER_ID}`;
    await asApp(T.profileId, async (tx) => {
      expect(await tx`select id from training_programs`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.10 — training_progress RLS — owner sees OWN pet\'s progress only (as pawpi_app)', () => {
  it('owner O reads their pet\'s progress note + attendance', async () => {
    await asApp(O.profileId, async (tx) => {
      const rows = await tx<{ id: number; progress_note: string }[]>`
        select id, progress_note from training_progress
      `;
      expect(ids(rows)).toEqual([PROGRESS_ID]);
      expect(rows[0].progress_note).toBe('Great recall today');
    });
  });

  it('the trainer (active grant) reads the progress they logged', async () => {
    await asApp(T.profileId, async (tx) => {
      expect(ids(await tx`select id from training_progress`)).toEqual([PROGRESS_ID]);
    });
  });

  it('ANOTHER owner O2 sees ZERO of O\'s pet progress (owner-own-only guarantee)', async () => {
    await asApp(O2.profileId, async (tx) => {
      expect(await tx`select id from training_progress`).toHaveLength(0);
    });
  });

  it('an outsider X sees zero progress (incl. the note + video)', async () => {
    await asApp(X.profileId, async (tx) => {
      expect(
        await tx`select id, progress_note, video_lesson_urls from training_progress`,
      ).toHaveLength(0);
    });
  });

  it('no identity → zero progress', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from training_progress`).toHaveLength(0);
    });
  });

  it('the trainer loses progress access the instant their staff row flips to removed', async () => {
    await raw`update provider_staff set status = 'removed' where provider_id = ${TRAINER_ID} and user_profile_id = ${T.profileId}`;
    await asApp(T.profileId, async (tx) => {
      expect(await tx`select id from training_progress`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.10 — training_progress write RLS (log + join, as pawpi_app)', () => {
  it('the trainer (active grant) can INSERT progress for the pet', async () => {
    await seedTrainingSession(raw, { sessionId: 201, providerId: TRAINER_ID, kind: 'one_on_one' });
    await asApp(T.profileId, async (tx) => {
      const created = await tx`
        insert into training_progress
          (session_id, pet_id, owner_user_id, provider_id, status, progress_note)
        values (201, ${O.petId}, ${O.profileId}, ${TRAINER_ID}, 'completed', 'Sit mastered')
        returning id
      `;
      expect(created).toHaveLength(1);
    });
  });

  it('the trainer canNOT log progress for a pet they have NO grant on (O2\'s pet)', async () => {
    await seedTrainingSession(raw, { sessionId: 202, providerId: TRAINER_ID, kind: 'one_on_one' });
    await expect(
      asApp(T.profileId, (tx) => tx`
        insert into training_progress
          (session_id, pet_id, owner_user_id, provider_id, status)
        values (202, ${O2.petId}, ${O2.profileId}, ${TRAINER_ID}, 'completed')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('the trainer can UPDATE the progress note (log attendance / finish)', async () => {
    await asApp(T.profileId, async (tx) => {
      const updated = await tx`
        update training_progress set attended = true, progress_note = 'Updated'
        where id = ${PROGRESS_ID} returning id
      `;
      expect(updated).toHaveLength(1);
    });
  });

  it('the OWNER can JOIN a class (create a roster row for their own pet)', async () => {
    await seedTrainingSession(raw, { sessionId: 203, providerId: TRAINER_ID, kind: 'group_class', capacity: 5 });
    await asApp(O.profileId, async (tx) => {
      const created = await tx`
        insert into training_progress
          (session_id, pet_id, owner_user_id, provider_id, status)
        values (203, ${O.petId}, ${O.profileId}, ${TRAINER_ID}, 'booked')
        returning id
      `;
      expect(created).toHaveLength(1);
    });
  });

  it('an owner canNOT create a roster row for ANOTHER owner\'s pet (WITH CHECK reject)', async () => {
    await seedTrainingSession(raw, { sessionId: 204, providerId: TRAINER_ID, kind: 'group_class', capacity: 5 });
    await expect(
      asApp(O.profileId, (tx) => tx`
        insert into training_progress
          (session_id, pet_id, owner_user_id, provider_id, status)
        values (204, ${O2.petId}, ${O2.profileId}, ${TRAINER_ID}, 'booked')
      `),
    ).rejects.toThrow(/row-level security/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.10 — training_sessions RLS (staff-manage + published-public, as pawpi_app)', () => {
  it('any authed owner can browse a PUBLISHED trainer\'s group class (to join)', async () => {
    await asApp(O2.profileId, async (tx) => {
      expect(ids(await tx`select id from training_sessions`)).toEqual([SESSION_ID]);
    });
  });

  it('a DRAFT provider\'s sessions are NOT public (only staff)', async () => {
    await raw`update providers set status = 'draft' where id = ${TRAINER_ID}`;
    await asApp(O2.profileId, async (tx) => {
      expect(await tx`select id from training_sessions`).toHaveLength(0);
    });
    // …but the active staff still see it.
    await asApp(T.profileId, async (tx) => {
      expect(ids(await tx`select id from training_sessions`)).toEqual([SESSION_ID]);
    });
  });

  it('active staff can CREATE a session; a non-staff owner canNOT', async () => {
    await asApp(T.profileId, async (tx) => {
      const created = await tx`
        insert into training_sessions (provider_id, kind, title, capacity)
        values (${TRAINER_ID}, 'group_class', 'New class', 6) returning id
      `;
      expect(created).toHaveLength(1);
    });
    await expect(
      asApp(O.profileId, (tx) => tx`
        insert into training_sessions (provider_id, kind, title)
        values (${TRAINER_ID}, 'group_class', 'Hijack')
      `),
    ).rejects.toThrow(/row-level security/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.10 — group-class capacity (count-based, the 2.8 pattern)', () => {
  it('the live-attendee count is what the route checks against capacity', async () => {
    // The class has capacity 2 and one live attendee (PROGRESS_ID). Add a second owner\'s
    // pet so the class is now FULL (2/2). The route refuses a third join at >= capacity.
    await seedGrant(raw, {
      petId: O2.petId,
      ownerUserId: O2.profileId,
      providerId: TRAINER_ID,
      scopes: ['health_logs_write'],
      status: 'active',
    });
    await seedTrainingProgress(raw, {
      progressId: 301,
      sessionId: SESSION_ID,
      petId: O2.petId,
      ownerUserId: O2.profileId,
      providerId: TRAINER_ID,
      status: 'booked',
    });
    // Count via the superuser (the route counts with its own identity; here we assert the
    // capacity math the route relies on: 2 live attendees == capacity 2 → full).
    const [{ n }] = await raw<{ n: number }[]>`
      select count(*)::int as n from training_progress
      where session_id = ${SESSION_ID} and status = any (array['booked', 'completed'])
    `;
    const [{ cap }] = await raw<{ cap: number }[]>`
      select capacity as cap from training_sessions where id = ${SESSION_ID}
    `;
    expect(n).toBe(2);
    expect(n).toBeGreaterThanOrEqual(cap); // → the route returns 409 "This class is full"
  });

  it('a cancelled attendee does NOT count toward capacity', async () => {
    await raw`update training_progress set status = 'cancelled' where id = ${PROGRESS_ID}`;
    const [{ n }] = await raw<{ n: number }[]>`
      select count(*)::int as n from training_progress
      where session_id = ${SESSION_ID} and status = any (array['booked', 'completed'])
    `;
    expect(n).toBe(0); // a cancelled join frees the seat
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.10 — meet booking / fee reuse (the booking rides 2.4 RLS unchanged)', () => {
  it('an owner books a TRAINER booking and reads it back; an outsider cannot', async () => {
    await seedGeneralBooking(raw, {
      apptId: 500,
      petId: O.petId,
      ownerUserId: O.profileId,
      providerId: TRAINER_ID,
      capability: 'trainer',
    });
    await asApp(O.profileId, async (tx) => {
      expect(
        await tx`select id from vet_appointments where id = 500`,
      ).toHaveLength(1);
    });
    await asApp(X.profileId, async (tx) => {
      expect(await tx`select id from vet_appointments where id = 500`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.10 — completeness: training tables are ENABLE+FORCE RLS with policies', () => {
  it('all three training tables are policied (the model cannot silently regress)', async () => {
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
        and c.relname in ('training_programs', 'training_sessions', 'training_progress')
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
