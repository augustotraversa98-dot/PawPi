// The directory loader (supabase/seed/directory/load_master.mjs) — runs the REAL load against the migrated
// throwaway Postgres.
//
// What this proves: a re-run with fresh Google data refreshes a listing nobody has claimed, and writes nothing at
// all (providers row and location, updated_at included) to one that is claimed or whose claim is pending.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb } from './db';
import { loadRows } from '../../../../../supabase/seed/directory/load_master.mjs';

let raw: Sql;

beforeAll(() => {
  raw = makeTestSql();
});
afterAll(async () => {
  await raw.end();
});
afterEach(async () => {
  await resetDb(raw);
});

beforeEach(async () => {
  // 0124 creates the system directory profile at migration time, so it exists until the first reset.
  const [owner] = await raw`select id from user_profiles where username = 'pawpi_directory'`;
  if (!owner) {
    const [au] = await raw`
      insert into auth_users (name, email) values ('Directory', 'dir@example.com') returning id`;
    await raw`
      insert into user_profiles (auth_user_id, username) values (${au.id}, 'pawpi_directory')`;
  }
});

const csvRow = (externalId: string, google: Record<string, string> = {}) => ({
  provider_type: 'vet',
  external_source: 'serpapi_gmaps',
  external_id: externalId,
  name: `Vet ${externalId}`,
  area: 'Palermo, CABA',
  website: '',
  address: 'Old street 1',
  lat: '-34.5800',
  lng: '-58.4200',
  phone: '+54 11 1111-1111',
  hours_json: '',
  pet_policy: '',
  ...google,
});

const fresh = (externalId: string) =>
  csvRow(externalId, {
    provider_type: 'shop',
    name: 'Name from Google',
    address: 'Google street 99',
    lat: '-34.6000',
    lng: '-58.5000',
    phone: '+54 11 9999-9999',
    pet_policy: 'inside',
  });

const IDS = ['open', 'taken', 'waiting'];

const snapshot = async (externalId: string) => {
  const [row] = await raw`
    select p.name, p.provider_type, p.claim_status, p.updated_at::text as updated_at,
           l.address, l.lat::float8 as lat, l.lng::float8 as lng, l.phone, l.hours_json, l.pet_policy,
           l.updated_at::text as loc_updated_at,
           (select count(*)::int from provider_locations m where m.provider_id = p.id) as locations
      from providers p left join provider_locations l on l.provider_id = p.id
     where p.external_id = ${externalId}`;
  return row;
};

/** Load three listings, then make one claimed and one pending, with the owner's own data. */
async function loadThenClaim() {
  await loadRows(raw, IDS.map((id) => csvRow(id)));
  for (const [externalId, status] of [['taken', 'claimed'], ['waiting', 'pending']]) {
    await raw`
      update providers set claim_status = ${status}, name = 'Name the owner chose', updated_at = '2026-01-01T00:00:00Z'
      where external_id = ${externalId}`;
    await raw`
      update provider_locations set address = 'Owner street 5', phone = '+54 11 5555-5555',
             hours_json = ${raw.json({ mon: { open: '08:00', close: '12:00' } })}, updated_at = '2026-01-01T00:00:00Z'
      where provider_id = (select id from providers where external_id = ${externalId})`;
  }
}

describe('load_master re-run', () => {
  it('inserts new listings as unclaimed', async () => {
    const stats = await loadRows(raw, IDS.map((id) => csvRow(id)));
    expect(stats).toMatchObject({ read: 3, inserted: 3, updated: 0, skipped_claimed: 0, errors: 0 });
    expect(await snapshot('open')).toMatchObject({ claim_status: 'unclaimed', address: 'Old street 1', locations: 1 });
  });

  it('refreshes the unclaimed listing from fresh Google data and leaves claimed and pending ones untouched', async () => {
    await loadThenClaim();
    const taken = await snapshot('taken');
    const waiting = await snapshot('waiting');

    const stats = await loadRows(raw, IDS.map(fresh));
    expect(stats).toMatchObject({ inserted: 0, updated: 1, skipped_claimed: 2, errors: 0 });

    expect(await snapshot('open')).toMatchObject({
      name: 'Name from Google',
      provider_type: 'shop',
      address: 'Google street 99',
      lat: -34.6,
      lng: -58.5,
      phone: '+54 11 9999-9999',
      pet_policy: 'inside',
      locations: 1,
    });
    expect(await snapshot('taken')).toEqual(taken);
    expect(await snapshot('waiting')).toEqual(waiting);
    expect(taken).toMatchObject({ name: 'Name the owner chose', address: 'Owner street 5' });
  });

  it('does not recreate a location a claimed business removed', async () => {
    await loadThenClaim();
    await raw`delete from provider_locations where provider_id = (select id from providers where external_id = 'taken')`;
    await loadRows(raw, [fresh('taken')]);
    expect(await snapshot('taken')).toMatchObject({ locations: 0, name: 'Name the owner chose' });
  });
});
