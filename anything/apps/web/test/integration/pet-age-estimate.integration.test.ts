// Pet age from a birth date or a growing estimate (migration 0156), on the REAL tables, through the REAL request
// router, as pawpi_app:
//   • app_pet_age() agrees with the shared test vectors;
//   • row security on pets covers the two new columns; re-applying the migration is harmless; verify scripts pass;
//   • every route that returns an age returns the computed one, and others never get the estimate's date;
//   • older app builds that send the same age back change nothing, a real change wins;
//   • the web code on a database without 0156.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, inject, vi } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { MIGRATIONS_DIR, makeTestSql, resetDb, seedOwnerWithPet } from './db';
import { todayForAge } from '../../src/app/api/utils/petAge';
import vectors from '../fixtures/petAgeVectors.json';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };

const readMigration = (name: string) => readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
const readVerify = (name: string) => readFileSync(join(MIGRATIONS_DIR, '..', name), 'utf8');
const migration0156 = readMigration('0156_pet_age_estimate.sql');

let raw: Sql;
let app: Sql;
let api: { request: (path: string, init?: RequestInit) => Promise<Response> };

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx as unknown as Sql);
  }) as Promise<T>;
}

const as = (who: { authUserId: number } | null) => {
  authState.session = who === null ? null : { user: { id: who.authUserId } };
};
let ip = 0;
const get = async (path: string) => {
  const res = await api.request(path, { headers: { 'x-real-ip': `10.6.0.${++ip}` } });
  expect(res.status, path).toBe(200);
  return res.json();
};
const send = async (method: string, path: string, body: Record<string, unknown>, status = 200) => {
  const res = await api.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(res.status, `${method} ${path}`).toBe(status);
  return res.json();
};
const createPet = async (body: Record<string, unknown>) => {
  as(A);
  const { pet } = await send('POST', '/pets', { name: 'Nube', breed: 'Beagle', ...body }, 201);
  return pet;
};
const editPet = async (body: Record<string, unknown>, id = A.petId) => {
  as(A);
  return (await send('PATCH', `/pets/${id}`, body)).pet;
};

/** The stored age columns, dates as YYYY-MM-DD. */
const stored = async (id = A.petId) => {
  const [row] = await raw`
    select birthday::text, adoption_date::text, age_years, age_months,
           to_jsonb(pets) -> 'age_estimate_months' as age_estimate_months,
           to_jsonb(pets) ->> 'age_estimated_on' as age_estimated_on
      from pets where id = ${id}`;
  return { ...row } as Record<string, any>;
};
const setEstimate = (months: number, yearsAgo = 0, id = A.petId) => raw`
  update pets set age_years = ${Math.floor(months / 12)}, age_months = ${months % 12},
         age_estimate_months = ${months},
         age_estimated_on = (${todayForAge()}::date - make_interval(years => ${yearsAgo}))::date
   where id = ${id}`;
const yearsBack = async (years: number) => {
  const [row] = await raw`select (${todayForAge()}::date - make_interval(years => ${years}))::date::text as day`;
  return row.day as string;
};

/** Every place a route returns this pet's age. */
const agesEverywhere = async (id = A.petId) => {
  as(A);
  const list = (await get('/pets')).pets.find((p: any) => p.id === id);
  const one = (await get(`/pets/${id}`)).pet;
  const medical = (await get(`/pet-medical-profiles?petId=${id}`)).pet;
  const card = (await get(`/emergency-card?petId=${id}`)).pet;
  as(B);
  const other = (await get(`/pets/${id}/profile`)).pet;
  as(null);
  const [{ tag_token }] = await raw`select tag_token from pet_emergency_cards where pet_id = ${id}`;
  const tag = (await get(`/public/emergency/tag/${tag_token}`)).card.pet;
  as(A);
  return { list, one, medical, card, other, tag };
};
const expectAge = async (years: number | null, months: number | null, id = A.petId) => {
  const views = await agesEverywhere(id);
  for (const [name, pet] of Object.entries(views)) {
    expect([name, pet.age_years, pet.age_months]).toEqual([name, years, months]);
    expect(pet, name).not.toHaveProperty('_row');
  }
  return views;
};

beforeAll(async () => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL'));
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  app = postgres(url.toString(), { max: 1, onnotice: () => {} });
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'disable';
  // Imported AFTER the env is set: the shared `sql` reads DATABASE_URL at import time.
  ({ api } = (await import('../../__create/route-builder')) as any);
  // Other files re-apply older migrations on the shared cluster; assert this file's final state first.
  await raw.unsafe(migration0156);
});

afterAll(async () => {
  await app.end();
  await raw.end();
});

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  // The seeded pets use explicit ids; new ones start after them.
  await raw`select setval(pg_get_serial_sequence('pets', 'id'), 100)`;
});

afterEach(async () => {
  await resetDb(raw);
  as(null);
  vi.restoreAllMocks();
});

describe('app_pet_age() and the shared test vectors', () => {
  it.each(vectors.cases.map((c) => [c.name, c] as [string, any]))('%s', async (_name, c) => {
    const p = c.pet;
    const [row] = await asApp(A.profileId, (tx) => tx`
      select * from app_pet_age(
        ${p.birthday ? String(p.birthday).slice(0, 10) : null}::date,
        ${p.age_estimate_months ?? null}::integer, ${p.age_estimated_on ?? null}::date,
        ${p.age_years ?? null}::integer, ${p.age_months ?? null}::integer, ${c.today}::date)`);
    const unknown = row.basis === 'stored' && !row.age_years && !row.age_months;
    const result = unknown
      ? null
      : { years: row.age_years ?? 0, months: row.age_months ?? 0, approximate: row.basis !== 'birthday' };
    expect(result).toEqual(c.expected);
  });
});

describe('the new columns', () => {
  it('are written by the owner only, under row security', async () => {
    const write = (tx: Sql) => tx`
      update pets set age_years = 1, age_months = 0, age_estimate_months = 12, age_estimated_on = current_date
       where id = ${A.petId}`;
    expect((await asApp(B.profileId, write)).count).toBe(0);
    expect((await asApp(null, write)).count).toBe(0);
    expect((await stored()).age_estimate_months).toBeNull();
    expect((await asApp(A.profileId, write)).count).toBe(1);
  });

  it('are set together and stay in range', async () => {
    await expect(raw`update pets set age_estimate_months = 12 where id = ${A.petId}`).rejects.toThrow(
      /pets_age_estimate_pair/,
    );
    await expect(raw`update pets set age_estimated_on = current_date where id = ${A.petId}`).rejects.toThrow(
      /pets_age_estimate_pair/,
    );
    await expect(
      raw`update pets set age_estimate_months = -1, age_estimated_on = current_date where id = ${A.petId}`,
    ).rejects.toThrow(/pets_age_estimate_pair/);
  });

  it('re-applying the migration changes no row, and every verify row reads PASS', async () => {
    await setEstimate(24, 1);
    await raw`update pets set age_years = 7 where id = ${B.petId}`;
    const before = [...(await raw`select * from pets order by id`)];
    await raw.unsafe(migration0156);
    await raw.unsafe(migration0156);
    expect([...(await raw`select * from pets order by id`)]).toEqual(before);
    for (const [script, rows] of [
      ['verify_0156.sql', 10],
      ['verify_0099.sql', 3],
      ['verify_0146.sql', null],
      ['verify_0152.sql', 11],
    ] as [string, number | null][]) {
      const result = await raw.unsafe(readVerify(script));
      if (rows !== null) expect(result.length, script).toBe(rows);
      expect(result.length, script).toBeGreaterThan(0);
      expect(result.filter((r: any) => r.status !== 'PASS'), script).toEqual([]);
    }
  });

  it('verify_0156 can fail: with the 0152 assembler and the 0099 cohort (rolled back)', async () => {
    await raw
      .begin(async (tx) => {
        await tx.unsafe(readMigration('0099_engagement_activity_insight.sql'));
        await tx.unsafe(readMigration('0152_emergency_contact_channels.sql'));
        const failed = (await tx.unsafe(readVerify('verify_0156.sql')))
          .filter((r: any) => r.status !== 'PASS')
          .map((r: any) => r.check_name.split(':')[0]);
        expect(failed).toEqual(['card assembler', 'activity cohort']);
        throw new Error('rollback');
      })
      .catch((e: Error) => {
        if (e.message !== 'rollback') throw e;
      });
  });
});

describe('through the routes', () => {
  beforeEach(async () => {
    await raw`
      insert into pet_emergency_cards (pet_id, owner_user_id, tag_token, active)
      values (${A.petId}, ${A.profileId}, 'TAGAGE1', true)`;
    await raw`update pets set breed = 'Beagle' where id = ${A.petId}`;
  });

  it('a new pet with a birth date: exact age, no estimate', async () => {
    const birthday = await yearsBack(3);
    const pet = await createPet({ birthday, adoption_date: await yearsBack(1) });
    expect([pet.age_years, pet.age_months, pet.age_estimate_months]).toEqual([3, 0, null]);
    expect(await stored(pet.id)).toMatchObject({ birthday, age_estimate_months: null, age_estimated_on: null });
  });

  it('a new pet with an estimate keeps the date it was given; the adoption date is optional', async () => {
    const pet = await createPet({ age_years: 2, age_months: null });
    expect([pet.age_years, pet.age_months, pet.age_estimate_months]).toEqual([2, 0, 24]);
    expect(await stored(pet.id)).toMatchObject({
      birthday: null,
      adoption_date: null,
      age_estimate_months: 24,
      age_estimated_on: todayForAge(),
    });
  });

  it('a new pet of a few months stores zero years', async () => {
    const pet = await createPet({ age_years: 0, age_months: 0 });
    expect(await stored(pet.id)).toMatchObject({ age_years: 0, age_months: 0, age_estimate_months: 0 });
  });

  it('a new pet with no age at all has no estimate', async () => {
    const pet = await createPet({});
    expect(await stored(pet.id)).toMatchObject({ age_years: null, age_months: null, age_estimate_months: null });
  });

  it('an estimate given a year ago reads one year older everywhere; others do not get its date', async () => {
    await setEstimate(24, 1);
    const views = await expectAge(3, 0);
    for (const view of [views.list, views.one, views.medical]) {
      expect(view.age_estimate_months).toBe(24);
    }
    for (const view of [views.card, views.other, views.tag]) {
      expect(view).not.toHaveProperty('age_estimated_on');
      expect(view).not.toHaveProperty('age_estimate_months');
    }
    expect(views.other.age_is_estimate).toBe(true);
    expect(views.card).not.toHaveProperty('birthday');
    // Reading changes nothing stored.
    expect(await stored()).toMatchObject({ age_years: 2, age_months: 0, age_estimate_months: 24 });
  });

  it('a birth date reads exact everywhere, also over a stored age', async () => {
    await raw`update pets set birthday = ${await yearsBack(5)}, age_years = 1, age_months = 1 where id = ${A.petId}`;
    const views = await expectAge(5, 0);
    expect(views.other).not.toHaveProperty('age_is_estimate');
  });

  it('a pet with only a stored age reads unchanged, and saving the same age keeps it that way', async () => {
    await raw`update pets set age_years = 4, age_months = 2 where id = ${A.petId}`;
    const views = await expectAge(4, 2);
    expect(views.other).not.toHaveProperty('age_is_estimate');
    await editPet({ name: 'Rexy', birthday: null, age_years: 4, age_months: 2 });
    await send('POST', '/pet-medical-profiles', { petId: A.petId, birthday: null, ageYears: 4, ageMonths: 2 });
    expect(await stored()).toMatchObject({ age_years: 4, age_months: 2, age_estimate_months: null });
  });

  it('an older app sending back the age it was given keeps the estimate', async () => {
    await setEstimate(24, 1);
    const before = await stored();
    const pet = await editPet({ name: 'Rexy', birthday: null, age_years: 3, age_months: 0 });
    expect([pet.age_years, pet.age_months]).toEqual([3, 0]);
    await send('POST', '/pet-medical-profiles', { petId: A.petId, birthday: null, ageYears: 3, ageMonths: null });
    expect(await stored()).toEqual(before);
  });

  it.each(['pets', 'pet-medical-profiles'])('a changed age through /%s is a new estimate given today', async (route) => {
    await setEstimate(24, 1);
    as(A);
    if (route === 'pets') await editPet({ birthday: null, age_years: 5, age_months: 6 });
    else await send('POST', '/pet-medical-profiles', { petId: A.petId, birthday: null, ageYears: 5, ageMonths: 6 });
    expect(await stored()).toMatchObject({
      age_years: 5,
      age_months: 6,
      age_estimate_months: 66,
      age_estimated_on: todayForAge(),
    });
    await expectAge(5, 6);
  });

  it('an edit that does not touch the age leaves the estimate alone', async () => {
    await setEstimate(24, 1);
    const before = await stored();
    await editPet({ name: 'Rexy', adoption_date: await yearsBack(1) });
    await send('POST', '/pet-medical-profiles', { petId: A.petId, breed: 'Beagle' });
    expect(await stored()).toEqual({ ...before, adoption_date: await yearsBack(1) });
  });

  it('switching between a birth date and an estimate clears the other', async () => {
    await setEstimate(24, 1);
    const birthday = await yearsBack(4);
    await editPet({ birthday });
    expect(await stored()).toMatchObject({ birthday, age_years: null, age_months: null, age_estimate_months: null, age_estimated_on: null });
    await expectAge(4, 0);

    await editPet({ birthday: null, age_years: 6, age_months: 0 });
    expect(await stored()).toMatchObject({ birthday: null, age_years: 6, age_estimate_months: 72 });

    await send('POST', '/pet-medical-profiles', { petId: A.petId, birthday });
    expect(await stored()).toMatchObject({ birthday, age_years: null, age_estimate_months: null });

    // Removing the birth date without an estimate leaves no age behind.
    await editPet({ birthday: null });
    expect(await stored()).toMatchObject({ birthday: null, age_years: null, age_months: null, age_estimate_months: null });
  });

  it('"not sure" in an older app keeps the age it showed, as an estimate from today', async () => {
    await raw`update pets set birthday = ${await yearsBack(3)} where id = ${A.petId}`;
    await editPet({ birthday: null, age_years: 3, age_months: 0 });
    expect(await stored()).toMatchObject({ birthday: null, age_estimate_months: 36, age_estimated_on: todayForAge() });
  });

  it('clearing the estimate really clears it', async () => {
    await setEstimate(24, 1);
    await editPet({ birthday: null, age_years: null, age_months: null });
    expect(await stored()).toMatchObject({ age_years: null, age_months: null, age_estimate_months: null, age_estimated_on: null });
  });

  it('the life stage grows with the estimate', async () => {
    await setEstimate(6, 0);
    as(A);
    expect((await get(`/pets/${A.petId}/life-stage`)).detected).toBe('puppy');
    await setEstimate(6, 2);
    expect((await get(`/pets/${A.petId}/life-stage`)).detected).toBe('adult');
  });

  it('the activity cohort compares computed ages', async () => {
    // Pet 1: estimate that has grown to 3. Pet 2: a birth date, 3 years old, no stored age. Pet 3: stored age 4.
    await setEstimate(12, 2);
    await raw`update pets set breed = 'beagle', birthday = ${await yearsBack(3)} where id = ${B.petId}`;
    await raw`
      insert into pets (id, owner_user_id, name, handle, breed, age_years) values
        (3, ${B.profileId}, 'Olga', 'olga', 'Beagle', 4),
        (4, ${B.profileId}, 'Tita', 'tita', 'Beagle', 9)`;
    const [row] = await asApp(A.profileId, (tx) =>
      tx`select * from app_activity_cohort(${A.petId}, ${A.profileId}, current_date, 2)`);
    expect(row.cohort_size).toBe(3);
  });
});

describe('new web code on a database without 0156', () => {
  beforeAll(async () => {
    await raw.unsafe(`
      drop function app_pet_age(date, integer, date, integer, integer, date);
      alter table pets drop column age_estimate_months, drop column age_estimated_on;`);
    await raw.unsafe(readMigration('0099_engagement_activity_insight.sql'));
    await raw.unsafe(readMigration('0152_emergency_contact_channels.sql'));
  });
  afterAll(async () => {
    await raw.unsafe(migration0156);
  });
  beforeEach(async () => {
    await raw`
      insert into pet_emergency_cards (pet_id, owner_user_id, tag_token, active)
      values (${A.petId}, ${A.profileId}, 'TAGAGE1', true)`;
  });

  it('a birth date and an adoption date work, and the age is computed', async () => {
    const birthday = await yearsBack(3);
    const adoption = await yearsBack(1);
    const pet = await createPet({ birthday, adoption_date: adoption });
    expect([pet.age_years, pet.age_months]).toEqual([3, 0]);
    expect(pet).not.toHaveProperty('age_estimate_months');
    expect(await stored(pet.id)).toMatchObject({ birthday, adoption_date: adoption });
  });

  it('an estimate is saved as a plain age, with no error', async () => {
    const created = await createPet({ age_years: 2, age_months: 3 });
    expect(created).not.toHaveProperty('age_estimate_months');
    expect(await stored(created.id)).toMatchObject({ age_years: 2, age_months: 3, age_estimate_months: null });

    await editPet({ birthday: null, age_years: 5, age_months: 1 });
    expect(await stored()).toMatchObject({ age_years: 5, age_months: 1 });
    await send('POST', '/pet-medical-profiles', { petId: A.petId, birthday: null, ageYears: 6, ageMonths: 0 });
    expect(await stored()).toMatchObject({ age_years: 6, age_months: 0 });

    const views = await agesEverywhere();
    for (const [name, pet] of Object.entries(views)) {
      // The public tag runs the 0152 function, which returns the stored age.
      expect([name, pet.age_years, pet.age_months]).toEqual([name, 6, 0]);
      expect(pet, name).not.toHaveProperty('age_estimate_months');
      expect(pet, name).not.toHaveProperty('age_is_estimate');
    }
    expect((await get(`/pets/${A.petId}/life-stage`)).detected).toBe('adult');
    expect((await get(`/pets/${A.petId}/activity-insight`)).this_week_walks).toBe(0);
  });
});
