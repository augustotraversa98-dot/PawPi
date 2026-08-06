// Migration 0075 — PawPi-owned places catalog, proven on the REAL table AS pawpi_app.
//
// places is a public read-mostly REFERENCE catalog (like food_recalls): RLS ENABLE + FORCE,
// any-authenticated-user READ of published+non-deleted rows, and NO write policy — so pawpi_app
// cannot write at all (the importer/seed run as an admin/service connection that bypasses FORCE).
// This proves: the migration applies with the expected columns/constraints, the RLS read scoping
// (published+non-deleted, anon zero, no pawpi_app write), the CHECK enums, idempotent upsert on the
// text id, and that place_reviews (0074) keys correctly off a places.id.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}
const ids = (rows: any[]) => rows.map((r: any) => r.id).sort();

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
  // Seed catalog rows as superuser (the admin/service path the importer uses): one published,
  // one hidden, one soft-deleted.
  await raw`
    insert into places (id, name, category, neighborhood, city, lat, lng, source, confidence, status)
    values
      ('osm-node-1', 'Dog Cafe', 'cafe', 'San Isidro', 'Buenos Aires', -34.47, -58.51, 'osm', 'high', 'published'),
      ('curated-hidden', 'Hidden Spot', 'bar', 'Martínez', 'Buenos Aires', null, null, 'curated', 'medium', 'hidden')
  `;
  await raw`
    insert into places (id, name, category, source, status, deleted_at)
    values ('osm-node-2', 'Gone', 'park', 'osm', 'published', now())
  `;
});

describe('places RLS + schema', () => {
  it('authed user reads ONLY published + non-deleted rows; anon reads ZERO', async () => {
    await asApp(A.profileId, async (tx) =>
      expect(ids(await tx`select id from places`)).toEqual(['osm-node-1']),
    );
    await asApp(null, async (tx) => expect(await tx`select id from places`).toHaveLength(0));
  });

  it('pawpi_app CANNOT write (no write policy on a FORCE-RLS catalog)', async () => {
    await expect(
      asApp(A.profileId, (tx) => tx`
        insert into places (id, name, category, source, status)
        values ('community-x', 'Forged', 'cafe', 'community', 'published')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('CHECK enums reject a bad category / source / status / confidence', async () => {
    await expect(
      raw`insert into places (id, name, category, source) values ('x1', 'X', 'nightclub', 'osm')`,
    ).rejects.toThrow(/places_category_check/);
    await expect(
      raw`insert into places (id, name, category, source) values ('x2', 'X', 'cafe', 'google')`,
    ).rejects.toThrow(/places_source_check/);
    await expect(
      raw`insert into places (id, name, category, source, status) values ('x3', 'X', 'cafe', 'osm', 'archived')`,
    ).rejects.toThrow(/places_status_check/);
    await expect(
      raw`insert into places (id, name, category, source, confidence) values ('x4', 'X', 'cafe', 'osm', 'low')`,
    ).rejects.toThrow(/places_confidence_check/);
  });

  it('upsert on the text id is idempotent (re-import updates in place, no duplicate)', async () => {
    await raw`
      insert into places (id, name, category, source, status)
      values ('osm-node-1', 'Dog Cafe (renamed)', 'cafe', 'osm', 'published')
      on conflict (id) do update set name = excluded.name, updated_at = now()
    `;
    const rows = await raw`select name from places where id = 'osm-node-1'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Dog Cafe (renamed)');
  });

  it('place_reviews (0074) keys correctly off a places.id — an authed user reads the review', async () => {
    await raw`
      insert into place_reviews
        (owner_user_id, place_id, place_name, overall_rating, pet_welcome_level)
      values (${A.profileId}, 'osm-node-1', 'Dog Cafe', 5, 'royalty')
    `;
    await asApp(A.profileId, async (tx) => {
      const rows = await tx`
        select r.overall_rating, p.name
        from place_reviews r join places p on p.id = r.place_id
        where r.place_id = 'osm-node-1'
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Dog Cafe');
      expect(rows[0].overall_rating).toBe(5);
    });
  });
});
