// AUDIT_2026-09 A-10 / A-11 — the daily moment and the Health timeline use the OWNER-LOCAL
// calendar day, never the server's UTC date. Proven on REAL Postgres through the real router.
//
// Deterministic without a frozen clock: the owner's timezone is chosen at test time so that
// "today" in that zone is a DIFFERENT calendar date from UTC (Kiritimati is UTC+14 and
// Pago Pago is UTC-11, 25 h apart, so at any instant at least one of them differs from UTC).

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: 'localday', petId: 1, petName: 'Rex' };

let raw: Sql;
let app: Sql;
let api: any;
let tz: string;
let localToday: string;
let utcToday: string;

const apiReq = (path: string, method = 'GET', body?: unknown) =>
  api.request(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

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
  url.username = 'pawpi_app';
  url.password = 'pawpi_app';
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_SSL = 'disable';
  ({ api } = (await import('../../__create/route-builder')) as any);

  await resetDb(raw);
  await seedOwnerWithPet(raw, OWNER);

  const [d] = await raw<{ k: string; p: string; u: string }[]>`
    select (now() at time zone 'Pacific/Kiritimati')::date::text as k,
           (now() at time zone 'Pacific/Pago_Pago')::date::text as p,
           (now() at time zone 'UTC')::date::text as u`;
  utcToday = d.u;
  tz = d.k !== d.u ? 'Pacific/Kiritimati' : 'Pacific/Pago_Pago';
  localToday = d.k !== d.u ? d.k : d.p;
  expect(localToday).not.toBe(utcToday);
  await raw`update user_profiles set timezone = ${tz} where id = ${OWNER.profileId}`;
  authState.session = { user: { id: OWNER.authUserId } };
});

afterAll(async () => {
  // Shared harness DB: leave it as we found it for the next file.
  await resetDb(raw);
  authState.session = null;
  await app.end();
  await raw.end();
});

describe('daily moment — owner-local day (A-10)', () => {
  it('POST /api/posts stamps post_date with the OWNER-local today, not the UTC date', async () => {
    const res = await apiReq('/posts', 'POST', {
      pet_id: OWNER.petId,
      image_url: 'https://cdn.example/x.jpg',
      caption: 'today',
      is_daily_update: true,
    });
    expect(res.status).toBe(201);
    const [row] = await raw<{ post_date: string }[]>`
      select post_date::text as post_date from posts where pet_id = ${OWNER.petId}`;
    expect(row.post_date).toBe(localToday);
    expect(row.post_date).not.toBe(utcToday);
  });

  it('today-daily-update and owner-posted-today agree with that day', async () => {
    const a = await (await apiReq(`/posts/today-daily-update?pet_id=${OWNER.petId}`)).json();
    expect(a.hasPostedToday).toBe(true);
    expect(a.todayDate).toBe(localToday);

    const b = await (await apiReq('/posts/owner-posted-today')).json();
    expect(b.hasPostedToday).toBe(true);
    expect(b.todayDate).toBe(localToday);
  });

  it('a second daily moment on the same owner-local day is refused (400)', async () => {
    const res = await apiReq('/posts', 'POST', {
      pet_id: OWNER.petId,
      image_url: 'https://cdn.example/y.jpg',
      is_daily_update: true,
    });
    expect(res.status).toBe(400);
  });
});

describe('health timeline — owner-local day window (A-11)', () => {
  it('a 23:30 owner-local log shows under the owner-local day, not the UTC day', async () => {
    await raw`
      insert into health_food_logs (pet_id, owner_user_id, logged_at, meal_type, food_name)
      values (${OWNER.petId}, ${OWNER.profileId},
              ((${localToday}::date + time '23:30')::timestamp at time zone ${tz}),
              'dinner', 'kibble')`;

    const onLocalDay = await (
      await apiReq(`/health/timeline?petId=${OWNER.petId}&date=${localToday}`)
    ).json();
    expect(onLocalDay.timeline.some((e: any) => (e.type ?? e.event_type) === 'food')).toBe(true);

    const onUtcDay = await (
      await apiReq(`/health/timeline?petId=${OWNER.petId}&date=${utcToday}`)
    ).json();
    expect(onUtcDay.timeline.some((e: any) => (e.type ?? e.event_type) === 'food')).toBe(false);

    // No ?date → defaults to the owner-local today, which is the day that holds the log.
    const defaulted = await (await apiReq(`/health/timeline?petId=${OWNER.petId}`)).json();
    expect(defaulted.timeline.some((e: any) => (e.type ?? e.event_type) === 'food')).toBe(true);
  });
});
