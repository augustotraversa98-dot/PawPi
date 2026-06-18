// Ticket 2.57 — adoption foster + urgent/featured flags. The new columns are ADDITIVE and ride the
// EXISTING adoptable_listings RLS (0038): they surface on the published-available public read and
// do NOT leak on a non-available (or non-published) row. No new policy.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedProvider, seedCapability, seedAdoptableListing } from './db';

const O = { authUserId: 1, profileId: 1, username: 'ownero', petId: 1, petName: 'Rex' }; // an unrelated authed user
const S = { authUserId: 2, profileId: 2, username: 'shelters' }; // shelter owner
const SHELTER_ID = 10;
const AVAILABLE = 100; // published + available (public)
const ADOPTED = 101;   // not available (non-public)

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
    host: url.hostname, port: Number(url.port), database: url.pathname.replace(/^\//, ''),
    username: 'pawpi_app', password: 'pawpi_app', max: 1, onnotice: () => {},
  });
});
afterAll(async () => { await app.end(); await raw.end(); });
afterEach(async () => { await resetDb(raw); });

beforeEach(async () => {
  await seedOwnerWithPet(raw, O);
  await seedUser(raw, S);
  await seedProvider(raw, { providerId: SHELTER_ID, ownerUserProfileId: S.profileId, slug: 'rescue', status: 'published' });
  await seedCapability(raw, { providerId: SHELTER_ID, capability: 'adoption' });
  await seedAdoptableListing(raw, { listingId: AVAILABLE, providerId: SHELTER_ID, status: 'available' });
  await seedAdoptableListing(raw, { listingId: ADOPTED, providerId: SHELTER_ID, status: 'adopted' });
  // Flag the AVAILABLE one urgent + featured + foster-or-adopt.
  await raw`
    update adoptable_listings
    set is_urgent = true, urgent_reason = 'Medical', is_featured = true, placement_type = 'both'
    where id = ${AVAILABLE}
  `;
  // The non-public one is ALSO flagged urgent — to prove the flag never leaks it.
  await raw`update adoptable_listings set is_urgent = true where id = ${ADOPTED}`;
});

describe('foster/urgent flags ride the existing adoption RLS', () => {
  it('an authed outsider reads the published-available listing WITH the new flags', async () => {
    await asApp(O.profileId, async (tx) => {
      const rows = await tx`
        select id, is_urgent, urgent_reason, is_featured, placement_type
        from adoptable_listings
      `;
      // ONLY the available row is visible (RLS unchanged) — the adopted one stays hidden.
      expect(ids(rows)).toEqual([AVAILABLE]);
      expect(rows[0].is_urgent).toBe(true);
      expect(rows[0].urgent_reason).toBe('Medical');
      expect(rows[0].is_featured).toBe(true);
      expect(rows[0].placement_type).toBe('both');
    });
  });

  it('the non-available row (even flagged urgent) never leaks to an outsider', async () => {
    await asApp(O.profileId, async (tx) => {
      expect(await tx`select id from adoptable_listings where id = ${ADOPTED}`).toHaveLength(0);
    });
  });

  it('shelter staff still see all their listings incl. the adopted one', async () => {
    await raw`insert into provider_staff (provider_id, user_profile_id, role, status)
              values (${SHELTER_ID}, ${S.profileId}, 'owner', 'active')`;
    await asApp(S.profileId, async (tx) => {
      expect(ids(await tx`select id from adoptable_listings`)).toEqual([AVAILABLE, ADOPTED]);
    });
  });

  it('an applicant can record requested_placement on their application', async () => {
    await asApp(O.profileId, async (tx) => {
      const created = await tx`
        insert into adoption_applications (listing_id, provider_id, applicant_owner_user_id, requested_placement)
        values (${AVAILABLE}, ${SHELTER_ID}, ${O.profileId}, 'foster')
        returning id, requested_placement
      `;
      expect(created[0].requested_placement).toBe('foster');
    });
  });
});
