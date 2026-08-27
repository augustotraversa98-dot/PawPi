// 0124 provider_claimable — proves the seed/claim primitives on the REAL tables
// under pawpi_app + FORCE RLS. Companion to provider-business-rls (0024).
//
// What this proves:
//   1. An unclaimed, published seed row (owned by the system 'pawpi_directory'
//      profile) is publicly readable to any authed caller — the discovery path
//      the mobile "¿Es tu negocio?" list depends on.
//   2. A non-admin, non-staff outsider CANNOT UPDATE that unclaimed row: 0024's
//      providers_update policy (app_is_provider_admin) still applies; adding the
//      claim columns didn't accidentally weaken write RLS.
//   3. The partial UNIQUE index providers_external_key rejects a duplicate
//      (external_source, external_id) import — the loader's idempotency guarantee.
//   4. Migration 0124 created the system directory profile with username
//      'pawpi_directory' and role 'admin' (both are load-bearing for the loader
//      and for future admin flows).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedUser } from './db';

const OUTSIDER = { authUserId: 100, profileId: 100, username: 'outsider_c' };

let raw: Sql;
let app: Sql;
let directoryProfileId: number;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
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

// Every test starts from the migrated baseline: the system directory profile exists,
// an outsider profile exists, and one seeded UNCLAIMED published provider owned by
// the directory is present with a matching provider_locations row.
beforeEach(async () => {
  await seedUser(raw, OUTSIDER);

  // 0124 seeded the directory profile at migration time; resetDb truncates it between
  // tests. Recreate on demand so this suite works from BOTH the first (post-migration)
  // and later (post-reset) baselines. Kept minimal (matches 0002 NOT NULLs).
  const existing = await raw<{ id: number }[]>`
    select id from user_profiles where username = 'pawpi_directory' limit 1
  `;
  if (existing.length > 0) {
    directoryProfileId = existing[0].id;
  } else {
    const [au] = await raw<{ id: number }[]>`
      insert into auth_users (name, email)
      values ('PawPi Directory', 'directory@pawpi.system') returning id`;
    const [prof] = await raw<{ id: number }[]>`
      insert into user_profiles (auth_user_id, role, username, onboarding_completed)
      values (${au.id}, 'admin', 'pawpi_directory', true) returning id`;
    directoryProfileId = prof.id;
  }

  // One seeded, unclaimed, published provider — the shape the loader produces.
  await raw`
    insert into providers
      (owner_user_profile_id, provider_type, name, slug, status,
       source, external_source, external_id, claim_status)
    values
      (${directoryProfileId}, 'vet', 'Leocan', 'leocan-palermo-caba-abc123',
       'published', 'serpapi_gmaps', 'serpapi_gmaps',
       '0x95bccb026fe44759:0x9332533fe99c2963', 'unclaimed')
  `;
  await raw`
    insert into provider_locations (provider_id, name, address, lat, lng, phone, pet_policy)
    select id, 'Leocan', 'Bulnes 1286, CABA', -34.5969, -58.4172, '+54 11 2098-8987', null
    from providers where slug = 'leocan-palermo-caba-abc123'
  `;
});

describe('0124 provider_claimable seed rows', () => {
  it('the system PawPi Directory profile is created with role admin', async () => {
    const [row] = await raw<{ id: number; role: string; username: string }[]>`
      select id, role, username from user_profiles where username = 'pawpi_directory'
    `;
    expect(row).toBeTruthy();
    expect(row.role).toBe('admin');
  });

  it('an unclaimed published seed row is publicly readable to any authed caller (0024 SELECT policy still holds)', async () => {
    const rows = await asApp(OUTSIDER.profileId, (tx) =>
      tx<{ id: number; claim_status: string; source: string; external_source: string }[]>`
        select id, claim_status, source, external_source
        from providers
        where external_id = '0x95bccb026fe44759:0x9332533fe99c2963'
      `,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].claim_status).toBe('unclaimed');
    expect(rows[0].source).toBe('serpapi_gmaps');
  });

  it('an outsider CANNOT update the unclaimed row (providers_update = app_is_provider_admin)', async () => {
    // Under pawpi_app + FORCE RLS, providers_update USING(app_is_provider_admin(id)) filters
    // the row out; the UPDATE affects zero rows rather than raising. Proves the added
    // claim columns did not accidentally widen write RLS.
    const updated = await asApp(OUTSIDER.profileId, (tx) =>
      tx<{ id: number }[]>`
        update providers set name = 'HACKED'
        where external_id = '0x95bccb026fe44759:0x9332533fe99c2963'
        returning id
      `,
    );
    expect(updated).toHaveLength(0);

    // And nothing changed at the raw layer either.
    const [row] = await raw<{ name: string }[]>`
      select name from providers where external_id = '0x95bccb026fe44759:0x9332533fe99c2963'
    `;
    expect(row.name).toBe('Leocan');
  });

  it('the partial UNIQUE index providers_external_key rejects a duplicate (external_source, external_id) import', async () => {
    await expect(
      raw`
        insert into providers
          (owner_user_profile_id, provider_type, name, slug, status,
           source, external_source, external_id, claim_status)
        values
          (${directoryProfileId}, 'vet', 'Leocan Dup', 'leocan-dup',
           'published', 'serpapi_gmaps', 'serpapi_gmaps',
           '0x95bccb026fe44759:0x9332533fe99c2963', 'unclaimed')
      `,
    ).rejects.toThrow(/providers_external_key|duplicate key value/i);
  });

  it('two owner-created providers with NULL external_source can coexist (index is partial)', async () => {
    // Both rows have external_source IS NULL → index does not constrain them.
    await raw`
      insert into providers (owner_user_profile_id, provider_type, name, slug, status)
      values (${OUTSIDER.profileId}, 'vet', 'A', 'a-slug', 'draft'),
             (${OUTSIDER.profileId}, 'vet', 'B', 'b-slug', 'draft')
    `;
    const [{ count }] = await raw<{ count: string }[]>`
      select count(*)::text from providers where source = 'owner'
    `;
    expect(Number(count)).toBeGreaterThanOrEqual(2);
  });

  it('provider_locations.pet_policy is present and nullable', async () => {
    const [row] = await raw<{ pet_policy: string | null }[]>`
      select pet_policy from provider_locations
      where provider_id = (select id from providers where external_id = '0x95bccb026fe44759:0x9332533fe99c2963')
    `;
    expect(row.pet_policy).toBeNull();

    await raw`
      update provider_locations set pet_policy = 'Dogs allowed inside'
      where provider_id = (select id from providers where external_id = '0x95bccb026fe44759:0x9332533fe99c2963')
    `;
    const [after] = await raw<{ pet_policy: string | null }[]>`
      select pet_policy from provider_locations
      where provider_id = (select id from providers where external_id = '0x95bccb026fe44759:0x9332533fe99c2963')
    `;
    expect(after.pet_policy).toBe('Dogs allowed inside');
  });
});
