// Numbers as app builds send them (decimals are typed with a comma in Argentina), through the REAL request router, as
// pawpi_app, into the real numeric / integer columns. A number the server can read is stored as typed; anything else is
// refused with a 400 in the caller's language, and nothing is stored, cut off, rounded or answered with a 500.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, inject, vi } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };

let raw: Sql;
let app: Sql;
let api: { request: (path: string, init?: RequestInit) => Promise<Response> };

let ip = 0;
const send = async (method: string, path: string, body: Record<string, unknown>, language = 'es-AR') => {
  const res = await api.request(path, {
    method,
    headers: { 'content-type': 'application/json', 'accept-language': language, 'x-real-ip': `10.7.0.${++ip}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

const petRow = async (id = A.petId) => {
  const [row] = await raw`select weight::text, weight_unit, breed from pets where id = ${id}`;
  return row;
};
const weighIns = async () => {
  const rows = await raw`select weight::text from health_weight_logs where pet_id = ${A.petId} order by id`;
  return rows.map((r) => r.weight);
};
const walks = async () => {
  const rows = await raw`
    select distance::text, duration_minutes, steps, average_speed::text
      from health_walk_logs where pet_id = ${A.petId} order by id`;
  return rows.map((r) => ({ ...r }));
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
});

afterAll(async () => {
  await app.end();
  await raw.end();
});

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await seedOwnerWithPet(raw, A);
  await raw`select setval(pg_get_serial_sequence('pets', 'id'), 100)`;
  authState.session = { user: { id: A.authUserId } };
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
  vi.restoreAllMocks();
});

const REFUSED = ['1.234', '12.500', '12,555', '12,', 'abc', '12 kg', 0, -3, 12.345, 500, 1250, true];

describe('medical profile (installed builds send the weight as typed text)', () => {
  const save = (extra: Record<string, unknown>, language?: string) =>
    send('POST', '/pet-medical-profiles', { petId: A.petId, weightUnit: 'kg', ...extra }, language);

  it.each([['12,5'], ['12.5'], [12.5]])('stores %s as 12.50', async (currentWeight) => {
    expect((await save({ currentWeight })).status).toBe(200);
    expect((await petRow()).weight).toBe('12.50');
  });

  it.each(REFUSED)('refuses %s and saves nothing', async (currentWeight) => {
    const res = await save({ currentWeight, breed: 'Beagle' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('weight_invalid');
    expect(res.body.error).toContain('Ingresá un peso válido');
    expect(await petRow()).toMatchObject({ weight: null, breed: null });
  });

  it('answers in English when the phone is in English', async () => {
    const res = await save({ currentWeight: '12,555' }, 'en-US');
    expect(res.body.error).toBe('Enter a valid weight, up to 160 kg, for example 12.5.');
  });

  it('a blank weight is left alone', async () => {
    await raw`update pets set weight = 9, weight_unit = 'kg' where id = ${A.petId}`;
    expect((await save({ currentWeight: '', breed: 'Beagle' })).status).toBe(200);
    expect((await petRow()).weight).toBe('9.00');
  });

  it('an already stored implausible weight, sent back unchanged, does not block the rest of the form', async () => {
    await raw`update pets set weight = 455, weight_unit = 'lbs' where id = ${A.petId}`;
    const res = await send('POST', '/pet-medical-profiles', {
      petId: A.petId, currentWeight: '455.00', weightUnit: 'lbs', breed: 'Beagle',
    });
    expect(res.status).toBe(200);
    expect(await petRow()).toEqual({ weight: '455.00', weight_unit: 'lbs', breed: 'Beagle' });
    // A different implausible value is still refused, and so is the same number under another unit.
    const other = await send('POST', '/pet-medical-profiles', { petId: A.petId, currentWeight: '456', weightUnit: 'lbs' });
    expect(other.status).toBe(400);
    const unit = await send('POST', '/pet-medical-profiles', { petId: A.petId, currentWeight: '455', weightUnit: 'kg' });
    expect(unit.status).toBe(400);
    expect((await petRow()).weight_unit).toBe('lbs');
  });
});

describe('weigh-ins', () => {
  const log = (weight: unknown) =>
    send('POST', '/health/weight-logs', { petId: A.petId, weight, weightUnit: 'kg' });

  it.each([['12,5'], [12.5]])('stores %s as 12.50', async (weight) => {
    expect((await log(weight)).status).toBe(201);
    expect(await weighIns()).toEqual(['12.50']);
  });

  it.each([...REFUSED, '', '  '])('refuses %s (an empty text used to be stored as NaN)', async (weight) => {
    const res = await log(weight);
    expect(res.status).toBe(400);
    expect(await weighIns()).toEqual([]);
  });
});

describe('creating and editing a dog', () => {
  const create = (weight: unknown) =>
    send('POST', '/pets', { name: 'Nube', breed: 'Beagle', weight, weight_unit: 'kg' });

  it('creates with a comma weight', async () => {
    const res = await create('12,5');
    expect(res.status).toBe(201);
    expect((await petRow(res.body.pet.id)).weight).toBe('12.50');
  });

  it('creates without a weight', async () => {
    const res = await create(null);
    expect(res.status).toBe(201);
    expect((await petRow(res.body.pet.id)).weight).toBeNull();
  });

  // 125 kg-style values from builds that drop the comma are only refused above the plausible maximum.
  it.each([455, 1250, '1.234', 'abc'])('refuses %s without creating the dog', async (weight) => {
    const res = await create(weight);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('weight_invalid');
    const [{ n }] = await raw`select count(*)::int as n from pets`;
    expect(n).toBe(1);
  });

  const edit = (body: Record<string, unknown>) => send('PATCH', `/pets/${A.petId}`, body);

  it('edits with a comma weight', async () => {
    expect((await edit({ weight: '14,2', weight_unit: 'kg' })).status).toBe(200);
    expect((await petRow()).weight).toBe('14.20');
  });

  it.each([1250, '12,555', 0])('refuses %s and changes nothing', async (weight) => {
    const res = await edit({ weight, weight_unit: 'kg', breed: 'Beagle' });
    expect(res.status).toBe(400);
    expect(await petRow()).toMatchObject({ weight: null, breed: null });
  });

  it('an empty text clears the weight (it used to fail)', async () => {
    await raw`update pets set weight = 9, weight_unit = 'kg' where id = ${A.petId}`;
    expect((await edit({ weight: '' })).status).toBe(200);
    expect((await petRow()).weight).toBeNull();
  });

  it('an already stored implausible weight, sent back unchanged, does not block a rename', async () => {
    await raw`update pets set weight = 455, weight_unit = 'lbs' where id = ${A.petId}`;
    await raw`insert into health_weight_logs (pet_id, owner_user_id, weight, weight_unit)
              values (${A.petId}, ${A.profileId}, 455, 'lbs')`;
    const res = await edit({ weight: 455, weight_unit: 'lbs', breed: 'Beagle' });
    expect(res.status).toBe(200);
    expect(await weighIns()).toEqual(['455.00']);
    expect((await petRow()).breed).toBe('Beagle');
    // Corrected by the owner.
    expect((await edit({ weight: 45.5, weight_unit: 'lbs' })).status).toBe(200);
    expect(await weighIns()).toEqual(['455.00', '45.50']);
  });
});

describe('walk logs', () => {
  const log = (extra: Record<string, unknown>) =>
    send('POST', '/health/walk-logs', { petId: A.petId, durationMinutes: 30, ...extra });

  it('reads a comma distance and speed, and keeps machine distances', async () => {
    expect((await log({ distance: '2,5', averageSpeed: '3,5' })).status).toBe(201);
    expect((await log({ distance: 1.2345678, durationMinutes: '45', steps: 1200 })).status).toBe(201);
    expect((await log({ distance: 0, durationMinutes: null })).status).toBe(201);
    expect(await walks()).toEqual([
      { distance: '2.50', duration_minutes: 30, steps: null, average_speed: '3.50' },
      { distance: '1.23', duration_minutes: 45, steps: 1200, average_speed: null },
      { distance: null, duration_minutes: null, steps: null, average_speed: null },
    ]);
  });

  it.each([
    [{ distance: '1.500' }, 'distance_invalid'],
    [{ distance: 1500 }, 'distance_invalid'],
    [{ distance: '2,5 km' }, 'distance_invalid'],
    [{ distance: -1 }, 'distance_invalid'],
    [{ durationMinutes: '1,5' }, 'whole_number_invalid'],
    [{ durationMinutes: 1.5 }, 'whole_number_invalid'],
    [{ steps: '1.000' }, 'whole_number_invalid'],
    [{ averageSpeed: 5000 }, 'speed_invalid'],
  ])('refuses %o with a 400, not a 500', async (extra, code) => {
    const res = await log(extra);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(code);
    expect(await walks()).toEqual([]);
  });
});

describe('integer columns', () => {
  const event = { title: 'Paseo', starts_at: '2030-03-01T10:00:00Z' };
  const capacities = async () => (await raw`select capacity from events order by id`).map((r) => r.capacity);

  it.each(['1,5', 1.5, '1.000', -1])('event capacity %s is refused on create and edit', async (capacity) => {
    expect((await send('POST', '/events', { ...event, capacity })).status).toBe(400);
    const created = await send('POST', '/events', { ...event, capacity: 10 });
    expect(created.status).toBe(201);
    expect((await send('PATCH', `/events/${created.body.event.id}`, { capacity })).status).toBe(400);
    expect(await capacities()).toEqual([10]);
  });

  it('nutrition calories: a decimal is refused on edit', async () => {
    const created = await send('POST', '/nutrition-plans', { pet_id: A.petId, food_brand: 'Acme', target_calories: 500 });
    expect(created.status).toBe(201);
    const res = await send('PATCH', `/nutrition-plans/${created.body.plan.id}`, { target_calories: '1,5' });
    expect(res.status).toBe(400);
    const [row] = await raw`select target_calories from nutrition_plans`;
    expect(row.target_calories).toBe(500);
  });
});
