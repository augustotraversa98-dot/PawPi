// Services Hub — capability scoping on GET /api/services/discover's unfiltered "All" branch,
// on REAL Postgres. Regression test for the "Stores & Vets → All shows non-pet businesses" bug
// (docs/SIMULATOR_QA_2026-09-C.md finding #7): the directory-claim-flow seed (0124 +
// supabase/seed/directory/load_master.mjs) loads dog-friendly cafes/restaurants into `providers`
// as provider_type='pet_friendly' rows that DELIBERATELY carry no provider_capabilities row (the
// migration's own comment: "no services"). The unfiltered "All" query used to only check
// status/is_demo, so any capability-less provider leaked in. The mirrored query below is the
// FIXED shape (route.js): it now requires an EXISTS over provider_capabilities even when no
// specific ?category/capability is requested — any real capability qualifies unfiltered, but a
// provider with zero capability rows never does.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedUser, seedProvider, seedCapability } from './db';

const OUTSIDER = { authUserId: 20, profileId: 20, username: 'browser' };
const OWNER = { authUserId: 10, profileId: 10, username: 'biz_owner' };

const VET = 1; // published, real capability → must surface unfiltered and under ?capability=vet
const CAFE = 2; // published, provider_type='pet_friendly', NO capability row → must NOT surface unfiltered

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}

// Mirrors the FIXED providers-branch WHERE clause in
// anything/apps/web/src/app/api/services/discover/route.js.
function discoverProviders(tx: Sql, opts: { capability?: string | null } = {}) {
  const capability = opts.capability ?? null;
  return tx`
    SELECT p.id, p.name
    FROM providers p
    WHERE p.status = 'published'
      AND p.is_demo IS NOT TRUE
      AND EXISTS (
        SELECT 1 FROM provider_capabilities pc
        WHERE pc.provider_id = p.id
          AND (${capability}::text IS NULL OR pc.capability = ${capability})
      )
    ORDER BY p.name ASC
  `;
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

beforeEach(async () => {
  await seedUser(raw, OUTSIDER);
  await seedUser(raw, OWNER);

  await seedProvider(raw, { providerId: VET, ownerUserProfileId: OWNER.profileId, slug: 'real-vet', status: 'published' });
  await seedCapability(raw, { providerId: VET, capability: 'vet' });

  // A directory-seeded "pet_friendly" venue: published, real, not demo — but no services, so no
  // provider_capabilities row (exactly the 0124/load_master.mjs shape confirmed live on prod).
  await raw`
    insert into providers (id, owner_user_profile_id, provider_type, name, slug, status)
    values (${CAFE}, ${OWNER.profileId}, 'pet_friendly', 'Dog-Friendly Cafe', 'dog-friendly-cafe', 'published')
  `;

  await raw`select setval(pg_get_serial_sequence('providers','id'), (select max(id) from providers))`;
});

describe('services/discover — capability-less directory rows excluded from unfiltered "All"', () => {
  it('unfiltered (no capability) returns the real vet but NOT the capability-less pet_friendly row', async () => {
    await asApp(OUTSIDER.profileId, async (tx) => {
      const rows = await discoverProviders(tx);
      expect(rows.map((r: any) => r.id)).toEqual([VET]);
      expect(rows.find((r: any) => r.id === CAFE)).toBeUndefined();
    });
  });

  it('?capability=vet still returns the real vet (unaffected by the EXISTS rewrite)', async () => {
    await asApp(OUTSIDER.profileId, async (tx) => {
      const rows = await discoverProviders(tx, { capability: 'vet' });
      expect(rows.map((r: any) => r.id)).toEqual([VET]);
    });
  });

  it('a capability-less row never surfaces, even under its own provider_type as a capability', async () => {
    await asApp(OUTSIDER.profileId, async (tx) => {
      const rows = await discoverProviders(tx, { capability: 'pet_friendly' });
      expect(rows).toHaveLength(0);
    });
  });
});
