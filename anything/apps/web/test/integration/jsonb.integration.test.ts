// jsonb write -> read round-trip against a REAL Postgres (RLS R0 / Phase C).
//
// This is the airtight version of the double-encode catch that pure unit tests
// can only approximate (PR #19): write a value to a jsonb column through the
// `sql.json` path and prove it reads back as a parsed object/array — not a
// stringified scalar. It also pins the FAILURE mode: writing the same value via
// JSON.stringify (the original bug) lands a jsonb *string* scalar, which this
// real DB can detect via jsonb_typeof. The mocked unit suite can't see either.

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

let sql: Sql;
let petId: number;
let ownerUserId: number;

beforeAll(() => {
  sql = makeTestSql();
});

afterAll(async () => {
  await sql.end();
});

afterEach(async () => {
  await resetDb(sql);
});

async function seed() {
  const owner = await seedOwnerWithPet(sql, {
    authUserId: 1,
    profileId: 1,
    username: 'owner',
    petId: 1,
    petName: 'Rex',
  });
  petId = owner.petId;
  ownerUserId = owner.ownerUserId;
}

describe('jsonb round-trip (real Postgres)', () => {
  it('an array written via sql.json reads back as a parsed array', async () => {
    await seed();
    const feeding = [
      { name: 'Breakfast', time: '08:00', days: [0, 2, 4] },
      { name: 'Dinner', time: '20:00', days: [3, 5] },
    ];

    await sql`
      insert into routines (pet_id, owner_user_id, routine_type, feeding_schedule)
      values (${petId}, ${ownerUserId}, 'feeding', ${sql.json(feeding)})
    `;

    const [row] = await sql<
      { feeding_schedule: unknown; t: string }[]
    >`select feeding_schedule, jsonb_typeof(feeding_schedule) as t from routines`;

    expect(row.t).toBe('array');
    expect(Array.isArray(row.feeding_schedule)).toBe(true);
    // Structural equality (jsonb normalizes key order, so deep-equal, not string).
    expect(row.feeding_schedule).toEqual(feeding);
  });

  it('an object written via sql.json reads back as a parsed object', async () => {
    await seed();
    const schedule = {
      items: [{ id: 'w1', type: 'weight', frequency: 'weekly' }],
      startDate: '2026-06-15',
      reminderTiming: 'on_time',
    };

    await sql`
      insert into routines (pet_id, owner_user_id, routine_type, wellness_check_schedule)
      values (${petId}, ${ownerUserId}, 'wellness_check', ${sql.json(schedule)})
    `;

    const [row] = await sql<
      { wellness_check_schedule: Record<string, unknown>; t: string }[]
    >`select wellness_check_schedule, jsonb_typeof(wellness_check_schedule) as t from routines`;

    expect(row.t).toBe('object');
    expect(row.wellness_check_schedule).toEqual(schedule);
    // Not a stringified scalar — nested access works without re-parsing.
    expect(row.wellness_check_schedule.startDate).toBe('2026-06-15');
  });

  it('the same value written via JSON.stringify is double-encoded (the bug this catches)', async () => {
    await seed();
    const feeding = [{ name: 'Breakfast', time: '08:00' }];

    // The original PR #19 bug: JSON.stringify into a jsonb column stores a jsonb
    // STRING scalar (the array re-encoded as text), not a real array.
    await sql`
      insert into routines (pet_id, owner_user_id, routine_type, feeding_schedule)
      values (${petId}, ${ownerUserId}, 'feeding', ${JSON.stringify(feeding)})
    `;

    const [bad] = await sql<
      { t: string }[]
    >`select jsonb_typeof(feeding_schedule) as t from routines`;
    expect(bad.t).toBe('string'); // the smell: scalar string, not 'array'

    // And the correct sql.json path on the same value is 'array' — the contrast
    // that makes this a real regression guard, not just a happy-path assertion.
    await resetDb(sql);
    await seed();
    await sql`
      insert into routines (pet_id, owner_user_id, routine_type, feeding_schedule)
      values (${petId}, ${ownerUserId}, 'feeding', ${sql.json(feeding)})
    `;
    const [good] = await sql<
      { t: string }[]
    >`select jsonb_typeof(feeding_schedule) as t from routines`;
    expect(good.t).toBe('array');
  });

  it('a health log values_json round-trips as a parsed object', async () => {
    await seed();
    const values = { weight: 12.5, unit: 'kg', condition: 'ideal' };

    await sql`
      insert into health_wellness_logs (pet_id, owner_user_id, check_type, values_json)
      values (${petId}, ${ownerUserId}, 'body_condition', ${sql.json(values)})
    `;

    const [row] = await sql<
      { values_json: Record<string, unknown>; t: string }[]
    >`select values_json, jsonb_typeof(values_json) as t from health_wellness_logs`;

    expect(row.t).toBe('object');
    expect(row.values_json).toEqual(values);
  });
});
