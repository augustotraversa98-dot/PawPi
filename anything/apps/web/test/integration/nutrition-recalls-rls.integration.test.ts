// Ticket 2.75 — nutrition plans + food-recall alerts, proven on the REAL tables AS pawpi_app.
//
// nutrition_plans (0061): owner-scoped FOR ALL. food_recalls: public reference data — any-authed READ,
// writes ONLY via the SECURITY DEFINER ingest_food_recall (no write policy). pet_food_recall_matches:
// owner-scoped; rows created by the DEFINER matcher (match_food_recall), which also fires a best-effort
// 'food_recall' notification.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Fido' };

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
  await seedOwnerWithPet(raw, B);
  await raw`
    insert into nutrition_plans (id, pet_id, owner_user_id, food_brand, food_product, active)
    values (500, ${A.petId}, ${A.profileId}, 'Acme', 'Chicken Recipe', true)
  `;
});

describe('nutrition_plans owner RLS', () => {
  it('owner reads/writes own; another owner reads ZERO', async () => {
    await asApp(A.profileId, async (tx) => expect(ids(await tx`select id from nutrition_plans`)).toEqual([500]));
    await asApp(B.profileId, async (tx) => expect(await tx`select id from nutrition_plans`).toHaveLength(0));
    await asApp(null, async (tx) => expect(await tx`select id from nutrition_plans`).toHaveLength(0));
  });

  it('a user cannot create a plan under another owner', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`insert into nutrition_plans (pet_id, owner_user_id, food_brand) values (${A.petId}, ${A.profileId}, 'Forged')`),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('food_recalls reference data', () => {
  it('a non-DEFINER insert is blocked (no write policy); DEFINER ingest works + any-authed read', async () => {
    // Direct insert as pawpi_app → denied (no write policy on food_recalls).
    await expect(
      asApp(A.profileId, (tx) => tx`insert into food_recalls (source, external_ref, brand) values ('FDA', 'X', 'Acme')`),
    ).rejects.toThrow(/row-level security/i);

    // DEFINER ingest (idempotent) succeeds.
    const [{ id }] = await asApp(null, (tx) => tx`
      select ingest_food_recall('FDA', 'R-1', 'Acme', 'Chicken Recipe', 'salmonella', null, null, '{}'::jsonb) as id
    `);
    expect(id).toBeTypeOf('number');

    // Any authed user can READ the recall notice.
    await asApp(A.profileId, async (tx) => expect((await tx`select id from food_recalls`).length).toBe(1));
    await asApp(B.profileId, async (tx) => expect((await tx`select id from food_recalls`).length).toBe(1));
    await asApp(null, async (tx) => expect((await tx`select id from food_recalls`).length).toBe(0));
  });

  it('ingest is idempotent on (source, external_ref) — same id, no duplicate, fields refreshed', async () => {
    const [{ id: id1 }] = await asApp(null, (tx) => tx`
      select ingest_food_recall('FDA', 'R-9', 'Acme', 'Chicken', 'salmonella', null, null, '{}'::jsonb) as id
    `);
    // Re-ingest the SAME (source, external_ref) with an updated reason → upsert, not a new row.
    const [{ id: id2 }] = await asApp(null, (tx) => tx`
      select ingest_food_recall('FDA', 'R-9', 'Acme', 'Chicken', 'listeria', null, null, '{}'::jsonb) as id
    `);
    expect(id2).toBe(id1); // same row
    const rows = await raw`select id, reason from food_recalls where source = 'FDA' and external_ref = 'R-9'`;
    expect(rows.length).toBe(1); // exactly one row, no duplicate
    expect(rows[0].reason).toBe('listeria'); // fields refreshed
  });
});

describe('match_food_recall DEFINER', () => {
  it('links a matching plan → owner-scoped alert + a food_recall notification', async () => {
    const [{ id: recallId }] = await asApp(null, (tx) => tx`
      select ingest_food_recall('FDA', 'R-1', 'Acme', 'Chicken', 'salmonella', null, null, '{}'::jsonb) as id
    `);
    const [{ n }] = await asApp(null, (tx) => tx`select match_food_recall(${recallId}) as n`);
    expect(n).toBe(1); // A's plan (brand Acme, product "Chicken Recipe" contains "Chicken")

    // The alert is owner-scoped: A sees it, B sees zero.
    await asApp(A.profileId, async (tx) => expect((await tx`select id from pet_food_recall_matches`).length).toBe(1));
    await asApp(B.profileId, async (tx) => expect((await tx`select id from pet_food_recall_matches`).length).toBe(0));

    // A best-effort 'food_recall' notification was raised for A.
    const [{ c }] = await raw`select count(*)::int as c from notifications where recipient_user_id = ${A.profileId} and type = 'food_recall'`;
    expect(c).toBe(1);
  });

  it('a non-matching brand creates no alert', async () => {
    const [{ id: recallId }] = await asApp(null, (tx) => tx`
      select ingest_food_recall('FDA', 'R-2', 'OtherBrand', null, 'mold', null, null, '{}'::jsonb) as id
    `);
    const [{ n }] = await asApp(null, (tx) => tx`select match_food_recall(${recallId}) as n`);
    expect(n).toBe(0);
    const [{ c }] = await raw`select count(*)::int as c from pet_food_recall_matches`;
    expect(c).toBe(0);
  });

  it('re-matching is idempotent (UNIQUE(pet_id, recall_id))', async () => {
    const [{ id: recallId }] = await asApp(null, (tx) => tx`
      select ingest_food_recall('FDA', 'R-1', 'Acme', null, 'salmonella', null, null, '{}'::jsonb) as id
    `);
    await asApp(null, (tx) => tx`select match_food_recall(${recallId})`);
    const [{ n }] = await asApp(null, (tx) => tx`select match_food_recall(${recallId}) as n`);
    expect(n).toBe(0); // already matched → no new row
    const [{ c }] = await raw`select count(*)::int as c from pet_food_recall_matches`;
    expect(c).toBe(1);
  });
});

describe('pet_food_recall_matches dismiss (owner-scoped UPDATE)', () => {
  beforeEach(async () => {
    const [{ id: recallId }] = await asApp(null, (tx) => tx`
      select ingest_food_recall('FDA', 'R-5', 'Acme', 'Chicken', 'salmonella', null, null, '{}'::jsonb) as id
    `);
    await asApp(null, (tx) => tx`select match_food_recall(${recallId})`); // creates A's match
  });

  it('the owner can dismiss their own alert; another owner dismisses ZERO', async () => {
    // B cannot dismiss A's alert — RLS scopes the UPDATE to the owner, so it touches no rows.
    await asApp(B.profileId, async (tx) =>
      expect(await tx`update pet_food_recall_matches set dismissed_at = now() where dismissed_at is null returning id`).toHaveLength(0),
    );
    // A dismisses their own alert.
    await asApp(A.profileId, async (tx) =>
      expect(await tx`update pet_food_recall_matches set dismissed_at = now() where dismissed_at is null returning id`).toHaveLength(1),
    );
    const [{ c }] = await raw`select count(*)::int as c from pet_food_recall_matches where dismissed_at is not null`;
    expect(c).toBe(1);
  });
});
