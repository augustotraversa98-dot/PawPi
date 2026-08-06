// Migration 0074 — pet-friendly PLACE reviews, proven on the REAL table AS pawpi_app.
//
// place_reviews mirrors provider_reviews' shape but WIDENS the read: aggregates over a place's
// reviews are PUBLIC, so SELECT is open to any authenticated app user (no "published provider"
// gate — a place is a public Google POI). Writes stay owner-only. This proves: the migration
// applies with the expected columns/constraints, public read among authenticated users, another
// user + anon seeing/writing correctly, the CHECK constraints, and the one-per-owner-per-place
// UNIQUE (upsert target).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser } from './db';

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb' };

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
  await seedOwnerWithPet(raw, A);
  await seedUser(raw, B);
  // A's review of place g-1 (seeded as superuser, bypassing RLS for setup).
  await raw`
    insert into place_reviews
      (id, owner_user_id, place_id, place_name, place_category, overall_rating, pet_welcome_level, amenities)
    values (500, ${A.profileId}, 'g-1', 'Dog Cafe', 'cafe', 5, 'royalty', array['water_bowls','treats'])
  `;
});

describe('place_reviews RLS + schema', () => {
  it('PUBLIC read: owner AND another authed user both see the review; anon sees ZERO', async () => {
    await asApp(A.profileId, async (tx) => expect(ids(await tx`select id from place_reviews`)).toEqual([500]));
    // B is a DIFFERENT user — but aggregates are public, so B still reads the review.
    await asApp(B.profileId, async (tx) => expect(ids(await tx`select id from place_reviews`)).toEqual([500]));
    // Anon (no identity) reads nothing — the SELECT policy requires an authenticated app user.
    await asApp(null, async (tx) => expect(await tx`select id from place_reviews`).toHaveLength(0));
  });

  it('owner inserts a review for themselves', async () => {
    const created = await asApp(A.profileId, (tx) => tx`
      insert into place_reviews
        (owner_user_id, place_id, place_name, overall_rating, pet_welcome_level)
      values (${A.profileId}, 'g-2', 'Park Bar', 4, 'allowed')
      returning id
    `);
    expect(created).toHaveLength(1);
  });

  it('edit-via-upsert: ON CONFLICT (owner, place_id) DO UPDATE keeps ONE row per owner+place', async () => {
    await asApp(A.profileId, (tx) => tx`
      insert into place_reviews
        (owner_user_id, place_id, place_name, overall_rating, pet_welcome_level, amenities)
      values (${A.profileId}, 'g-1', 'Dog Cafe', 2, 'patio_only', array['outdoor_patio'])
      on conflict (owner_user_id, place_id) do update set
        overall_rating = excluded.overall_rating,
        pet_welcome_level = excluded.pet_welcome_level,
        amenities = excluded.amenities,
        updated_at = now(),
        deleted_at = null
    `);
    const rows = await raw`select overall_rating, pet_welcome_level from place_reviews where owner_user_id = ${A.profileId} and place_id = 'g-1'`;
    expect(rows).toHaveLength(1); // still one row — edited, not duplicated
    expect(rows[0].overall_rating).toBe(2);
    expect(rows[0].pet_welcome_level).toBe('patio_only');
  });

  it('a user CANNOT write a review under another owner (RLS WITH CHECK)', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`
        insert into place_reviews
          (owner_user_id, place_id, place_name, overall_rating, pet_welcome_level)
        values (${A.profileId}, 'g-9', 'Forged', 5, 'royalty')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('another user updates/deletes ZERO of the owner\'s review; the owner can', async () => {
    await asApp(B.profileId, async (tx) => {
      expect(await tx`update place_reviews set overall_rating = 1 where id = 500 returning id`).toHaveLength(0);
      expect(await tx`delete from place_reviews where id = 500 returning id`).toHaveLength(0);
    });
    await asApp(A.profileId, async (tx) => {
      expect(await tx`update place_reviews set overall_rating = 3 where id = 500 returning id`).toHaveLength(1);
    });
  });

  it('CHECK constraints reject an out-of-range rating and an unknown welcome level', async () => {
    await expect(
      asApp(A.profileId, (tx) => tx`
        insert into place_reviews (owner_user_id, place_id, place_name, overall_rating, pet_welcome_level)
        values (${A.profileId}, 'g-bad', 'Bad', 6, 'royalty')
      `),
    ).rejects.toThrow(/place_reviews_overall_rating_check/);
    await expect(
      asApp(A.profileId, (tx) => tx`
        insert into place_reviews (owner_user_id, place_id, place_name, overall_rating, pet_welcome_level)
        values (${A.profileId}, 'g-bad', 'Bad', 4, 'meh')
      `),
    ).rejects.toThrow(/place_reviews_pet_welcome_level_check/);
  });

  it('UNIQUE (owner_user_id, place_id) blocks a second plain insert for the same place', async () => {
    await expect(
      asApp(A.profileId, (tx) => tx`
        insert into place_reviews (owner_user_id, place_id, place_name, overall_rating, pet_welcome_level)
        values (${A.profileId}, 'g-1', 'Dup', 3, 'allowed')
      `),
    ).rejects.toThrow(/place_reviews_owner_place_unique|duplicate key/);
  });
});
