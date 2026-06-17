// Ticket 2.7 — WALKING module, proven on the REAL tables acting AS pawpi_app.
// Companion to the R2 suites + grooming (2.6). 0033 adds walk_sessions with owner-FOR-ALL
// + ASSIGNED-walker (participant-scoped) RLS — the crux of this ticket, and the guard that
// LIVE LOCATION never leaks to a non-participant.
//
// What this proves (as pawpi_app, NOBYPASSRLS, identity stamped per transaction):
//   1. The capability GATE: provider_has_capability(provider, 'walker') is the exact
//      predicate requireProviderCapability uses — a NON-walker provider resolves false
//      (the app layer turns that into a 403), a walker provider resolves true.
//   2. walk_sessions is visible to the OWNER and to the ASSIGNED active walker — and to NO
//      ONE ELSE: an outsider, another owner, AND another walker of the SAME provider all
//      read ZERO. This is the LIVE-LOCATION participant guard (the ticket's DO-NOT).
//   3. The assigned walker can INSERT/UPDATE (check in + post GPS); a non-assigned walker
//      and an outsider cannot; a removed staff member loses access instantly.
//   4. The completeness guard already covers walk_sessions (ENABLE+FORCE + policies) via
//      rls-gap-closure's generic scan; we additionally assert it explicitly here.
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
  seedWalkSession,
} from './db';

// O = pet owner. W = the ASSIGNED active walker-staff. W2 = ANOTHER active walker of the
// same provider (NOT assigned — must read zero). X = authed outsider.
const O = { authUserId: 1, profileId: 1, username: 'ownero', petId: 1, petName: 'Rex' };
const W = { authUserId: 2, profileId: 2, username: 'walkerw' };
const W2 = { authUserId: 3, profileId: 3, username: 'walkerw2' };
const X = { authUserId: 4, profileId: 4, username: 'outsiderx' };
const WALKER_ID = 10; // a provider that HOLDS the 'walker' capability
const VET_ONLY_ID = 11; // a provider that does NOT hold 'walker'
const SESSION_ID = 100;

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

// O owns a pet; a WALKER provider with W + W2 as active staff (+ a vet-only provider for
// the capability-gate negative); an active health_logs_write grant for (pet, walker); one
// in_progress session ASSIGNED to W.
beforeEach(async () => {
  await seedOwnerWithPet(raw, O);
  await seedUser(raw, W);
  await seedUser(raw, W2);
  await seedUser(raw, X);
  await seedProvider(raw, {
    providerId: WALKER_ID,
    ownerUserProfileId: W.profileId,
    slug: 'paw-walks',
    status: 'published',
  });
  await seedStaff(raw, { providerId: WALKER_ID, userProfileId: W.profileId, role: 'owner' });
  await seedStaff(raw, { providerId: WALKER_ID, userProfileId: W2.profileId, role: 'staff' });
  await seedCapability(raw, { providerId: WALKER_ID, capability: 'walker' });
  // A second provider that holds vet but NOT walker (the capability-gate negative).
  await seedProvider(raw, {
    providerId: VET_ONLY_ID,
    ownerUserProfileId: W.profileId,
    slug: 'vet-only',
    status: 'published',
  });
  await seedCapability(raw, { providerId: VET_ONLY_ID, capability: 'vet' });
  // The owner granted the walker health_logs_write.
  await seedGrant(raw, {
    petId: O.petId,
    ownerUserId: O.profileId,
    providerId: WALKER_ID,
    scopes: ['health_logs_write'],
    status: 'active',
  });
  // The live session, assigned to W.
  await seedWalkSession(raw, {
    sessionId: SESSION_ID,
    petId: O.petId,
    ownerUserId: O.profileId,
    providerId: WALKER_ID,
    staffUserId: W.profileId,
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.7 — capability gate (provider_has_capability, as pawpi_app)', () => {
  it("a WALKER provider resolves 'walker' = true (gate passes)", async () => {
    await asApp(W.profileId, async (tx) => {
      const r = await tx`select provider_has_capability(${WALKER_ID}, 'walker') as has`;
      expect(r[0].has).toBe(true);
    });
  });

  it("a NON-walker provider resolves 'walker' = false (route → 403)", async () => {
    await asApp(W.profileId, async (tx) => {
      const r = await tx`select provider_has_capability(${VET_ONLY_ID}, 'walker') as has`;
      expect(r[0].has).toBe(false);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.7 — walk_sessions read RLS — the LIVE-LOCATION participant guard (as pawpi_app)', () => {
  it('owner O sees their pet walk session (the live map + report)', async () => {
    await asApp(O.profileId, async (tx) => {
      expect(ids(await tx`select id from walk_sessions`)).toEqual([SESSION_ID]);
    });
  });

  it('the ASSIGNED walker W sees the session (the live route they post)', async () => {
    await asApp(W.profileId, async (tx) => {
      expect(ids(await tx`select id from walk_sessions`)).toEqual([SESSION_ID]);
    });
  });

  it('ANOTHER walker (W2) of the SAME provider sees ZERO — live location is participant-only', async () => {
    await asApp(W2.profileId, async (tx) => {
      expect(await tx`select id from walk_sessions`).toHaveLength(0);
    });
  });

  it('an authed outsider X sees zero sessions', async () => {
    await asApp(X.profileId, async (tx) => {
      expect(await tx`select id from walk_sessions`).toHaveLength(0);
    });
  });

  it('no identity → zero sessions', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from walk_sessions`).toHaveLength(0);
    });
  });

  it('the assigned walker loses access the instant their staff row flips to removed', async () => {
    await raw`update provider_staff set status = 'removed' where provider_id = ${WALKER_ID} and user_profile_id = ${W.profileId}`;
    await asApp(W.profileId, async (tx) => {
      expect(await tx`select id from walk_sessions`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.7 — walk_sessions write RLS (as pawpi_app)', () => {
  it('the ASSIGNED walker can INSERT a session (check in)', async () => {
    await asApp(W.profileId, async (tx) => {
      const created = await tx`
        insert into walk_sessions (pet_id, owner_user_id, provider_id, staff_user_id, status)
        values (${O.petId}, ${O.profileId}, ${WALKER_ID}, ${W.profileId}, 'in_progress')
        returning id
      `;
      expect(created).toHaveLength(1);
    });
  });

  it('a walker CANNOT create a session assigned to ANOTHER walker (WITH CHECK reject)', async () => {
    await expect(
      asApp(W.profileId, (tx) => tx`
        insert into walk_sessions (pet_id, owner_user_id, provider_id, staff_user_id, status)
        values (${O.petId}, ${O.profileId}, ${WALKER_ID}, ${W2.profileId}, 'in_progress')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('an outsider CANNOT create a session', async () => {
    await expect(
      asApp(X.profileId, (tx) => tx`
        insert into walk_sessions (pet_id, owner_user_id, provider_id, staff_user_id, status)
        values (${O.petId}, ${O.profileId}, ${WALKER_ID}, ${X.profileId}, 'in_progress')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('the ASSIGNED walker can UPDATE their session (post GPS / finish)', async () => {
    await asApp(W.profileId, async (tx) => {
      const updated = await tx`
        update walk_sessions set status = 'finished', distance_m = 1200
        where id = ${SESSION_ID} returning id
      `;
      expect(updated).toHaveLength(1);
    });
  });

  it('a non-assigned walker (W2) UPDATEs ZERO of the live session', async () => {
    await asApp(W2.profileId, async (tx) => {
      expect(
        await tx`update walk_sessions set distance_m = 9999 returning id`,
      ).toHaveLength(0);
    });
    const [{ d }] = await raw`select distance_m as d from walk_sessions where id = ${SESSION_ID}`;
    expect(d).toBeNull(); // untouched
  });

  it('the owner can update their own session (cancel/correct)', async () => {
    await asApp(O.profileId, async (tx) => {
      const updated = await tx`
        update walk_sessions set status = 'cancelled'
        where id = ${SESSION_ID} returning id
      `;
      expect(updated).toHaveLength(1);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.7 — completeness: walk_sessions is ENABLE+FORCE RLS with policies', () => {
  it('walk_sessions is policied (the model cannot silently regress)', async () => {
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
        and c.relname = 'walk_sessions'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled, 'walk_sessions must ENABLE RLS').toBe(true);
    expect(rows[0].forced, 'walk_sessions must FORCE RLS').toBe(true);
    expect(rows[0].policies, 'walk_sessions must carry ≥1 policy').toBeGreaterThan(0);
  });
});
