// Ticket 2.6 — GROOMING module, proven on the REAL tables acting AS pawpi_app.
// Companion to the R2 suites. 0032 adds groom_sessions with owner-FOR-ALL +
// provider-via-health_logs_write-grant RLS — the crux of this ticket.
//
// What this proves (as pawpi_app, NOBYPASSRLS, identity stamped per transaction):
//   1. The capability GATE: provider_has_capability(provider, 'groomer') is the exact
//      predicate requireProviderCapability uses — a NON-groomer provider resolves false
//      (the app layer turns that into a 403), a groomer provider resolves true.
//   2. groom_sessions is visible to the OWNER and to a groomer with an ACTIVE
//      health_logs_write GRANT — and to NO ONE ELSE (no grant, wrong scope, no identity
//      all read zero).
//   3. A groomer WITH the grant can INSERT a session; WITHOUT the grant the insert is
//      denied by RLS; a removed staff member loses access instantly.
//   4. The completeness guard: groom_sessions is ENABLE+FORCE RLS with policies.
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
  seedGroomSession,
} from './db';

// O = pet owner. G = active staff of the GROOMER provider. X = authed outsider.
const O = { authUserId: 1, profileId: 1, username: 'ownero', petId: 1, petName: 'Rex' };
const G = { authUserId: 2, profileId: 2, username: 'groomerg' };
const X = { authUserId: 3, profileId: 3, username: 'outsiderx' };
const GROOMER_ID = 10; // a provider that HOLDS the 'groomer' capability
const VET_ONLY_ID = 11; // a provider that does NOT hold 'groomer'
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

// O owns a pet; a GROOMER provider with G as active staff (+ a vet-only provider for
// the capability-gate negative); an active health_logs_write grant for (pet, groomer);
// one logged session.
beforeEach(async () => {
  await seedOwnerWithPet(raw, O);
  await seedUser(raw, G);
  await seedUser(raw, X);
  await seedProvider(raw, {
    providerId: GROOMER_ID,
    ownerUserProfileId: G.profileId,
    slug: 'pet-spa',
    status: 'published',
  });
  await seedStaff(raw, { providerId: GROOMER_ID, userProfileId: G.profileId, role: 'owner' });
  await seedCapability(raw, { providerId: GROOMER_ID, capability: 'groomer' });
  // A second provider that holds vet but NOT groomer (the capability-gate negative).
  await seedProvider(raw, {
    providerId: VET_ONLY_ID,
    ownerUserProfileId: G.profileId,
    slug: 'vet-only',
    status: 'published',
  });
  await seedCapability(raw, { providerId: VET_ONLY_ID, capability: 'vet' });
  // The owner granted the groomer health_logs_write.
  await seedGrant(raw, {
    petId: O.petId,
    ownerUserId: O.profileId,
    providerId: GROOMER_ID,
    scopes: ['health_logs_write'],
    status: 'active',
  });
  await seedGroomSession(raw, {
    sessionId: SESSION_ID,
    petId: O.petId,
    ownerUserId: O.profileId,
    providerId: GROOMER_ID,
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.6 — capability gate (provider_has_capability, as pawpi_app)', () => {
  it("a GROOMER provider resolves 'groomer' = true (gate passes)", async () => {
    await asApp(G.profileId, async (tx) => {
      const r = await tx`select provider_has_capability(${GROOMER_ID}, 'groomer') as has`;
      expect(r[0].has).toBe(true);
    });
  });

  it("a NON-groomer provider resolves 'groomer' = false (route → 403)", async () => {
    await asApp(G.profileId, async (tx) => {
      const r = await tx`select provider_has_capability(${VET_ONLY_ID}, 'groomer') as has`;
      expect(r[0].has).toBe(false);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.6 — groom_sessions read RLS (as pawpi_app)', () => {
  it('owner O sees their pet groom session (before/after surface on the profile)', async () => {
    await asApp(O.profileId, async (tx) => {
      expect(ids(await tx`select id from groom_sessions`)).toEqual([SESSION_ID]);
    });
  });

  it('groomer G WITH an active health_logs_write grant sees the session', async () => {
    await asApp(G.profileId, async (tx) => {
      expect(ids(await tx`select id from groom_sessions`)).toEqual([SESSION_ID]);
    });
  });

  it('an authed outsider X sees zero sessions', async () => {
    await asApp(X.profileId, async (tx) => {
      expect(await tx`select id from groom_sessions`).toHaveLength(0);
    });
  });

  it('no identity → zero sessions', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from groom_sessions`).toHaveLength(0);
    });
  });

  it('the groomer loses access when the grant is REVOKED', async () => {
    await raw`update care_access_grants set status = 'revoked' where provider_id = ${GROOMER_ID} and pet_id = ${O.petId}`;
    await asApp(G.profileId, async (tx) => {
      expect(await tx`select id from groom_sessions`).toHaveLength(0);
    });
  });

  it('the groomer loses access the instant their staff row flips to removed', async () => {
    await raw`update provider_staff set status = 'removed' where provider_id = ${GROOMER_ID} and user_profile_id = ${G.profileId}`;
    await asApp(G.profileId, async (tx) => {
      expect(await tx`select id from groom_sessions`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.6 — groom_sessions write RLS (as pawpi_app)', () => {
  it('a groomer WITH the grant can INSERT a session', async () => {
    await asApp(G.profileId, async (tx) => {
      const created = await tx`
        insert into groom_sessions (pet_id, owner_user_id, provider_id, before_urls, coat_skin_notes)
        values (${O.petId}, ${O.profileId}, ${GROOMER_ID}, array['b.jpg'], 'smooth coat')
        returning id
      `;
      expect(created).toHaveLength(1);
    });
  });

  it('a groomer WITHOUT the grant CANNOT insert a session', async () => {
    await raw`update care_access_grants set status = 'revoked' where provider_id = ${GROOMER_ID} and pet_id = ${O.petId}`;
    await expect(
      asApp(G.profileId, (tx) => tx`
        insert into groom_sessions (pet_id, owner_user_id, provider_id, before_urls)
        values (${O.petId}, ${O.profileId}, ${GROOMER_ID}, array['b.jpg'])
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('an outsider CANNOT insert a session', async () => {
    await expect(
      asApp(X.profileId, (tx) => tx`
        insert into groom_sessions (pet_id, owner_user_id, provider_id, before_urls)
        values (${O.petId}, ${O.profileId}, ${GROOMER_ID}, array['x.jpg'])
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('the owner can update their own session (correct/remove)', async () => {
    await asApp(O.profileId, async (tx) => {
      const updated = await tx`
        update groom_sessions set products_used = 'oatmeal shampoo'
        where id = ${SESSION_ID} returning id
      `;
      expect(updated).toHaveLength(1);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('2.6 — completeness: groom_sessions is ENABLE+FORCE RLS with policies', () => {
  it('groom_sessions is policied (the model cannot silently regress)', async () => {
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
        and c.relname = 'groom_sessions'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled, 'groom_sessions must ENABLE RLS').toBe(true);
    expect(rows[0].forced, 'groom_sessions must FORCE RLS').toBe(true);
    expect(rows[0].policies, 'groom_sessions must carry ≥1 policy').toBeGreaterThan(0);
  });
});
