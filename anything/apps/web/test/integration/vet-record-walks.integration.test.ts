// Vet Record full-summary — walks PATTERN enrichment (ticket 2.102), proven through the REAL
// Hono router (api.request) against the embedded Postgres as pawpi_app (FORCE RLS like prod).
// The touched endpoint is exercised BY URL (no handler import): GET /api/vet-record/full-summary
// must, additively to the existing count/totalMinutes/totalDistance aggregate, return:
//   • walks.items — the most-recent per-walk rows (capped), each { start_time, duration_minutes,
//     distance }, most-recent first, with null-duration walks omitted (they still count);
//   • walks.perWeek — average walks per week over the [from, to] window (divide-by-zero → 0).

import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const OWNER = { authUserId: 1, profileId: 1, username: 'walkowner', petId: 100, petName: 'Rex' };

let raw: Sql;
let app: Sql;
let api: any;

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
});

afterAll(async () => {
  await app.end();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
  authState.session = null;
});

beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  // 4 timed walks (durations 30/25/27/22) across a 2-week window + 1 null-duration walk that
  // still counts but is omitted from items/totalMinutes.
  const rows: Array<[string, number | null, number]> = [
    ['2026-06-02', 30, 1.4],
    ['2026-06-05', 25, 1.2],
    ['2026-06-09', 27, 1.3],
    ['2026-06-12', 22, 1.1],
    ['2026-06-10', null, 0.0], // null-duration → counted, omitted from items
  ];
  for (const [d, dur, dist] of rows) {
    await raw`
      insert into health_walk_logs (pet_id, owner_user_id, start_time, duration_minutes, distance)
      values (${OWNER.petId}, ${OWNER.profileId}, ${`${d}T08:00:00Z`}, ${dur}, ${dist})
    `;
  }
});

it('returns walks.items (recent per-walk durations, capped, null-omitted) + walks.perWeek', async () => {
  authState.session = { user: { id: OWNER.authUserId } };
  const res = await api.request(
    `/vet-record/full-summary?petId=${OWNER.petId}&from=2026-06-01&to=2026-06-14`,
  );
  expect(res.status).toBe(200);
  const { summary } = await res.json();

  // Aggregate unchanged: all 5 walks count; totalMinutes skips the null-duration one.
  expect(summary.walks.count).toBe(5);
  expect(summary.walks.totalMinutes).toBe(104); // 30+25+27+22

  // items: null-duration omitted (4 rows), most-recent first, per-walk durations visible.
  expect(summary.walks.items).toHaveLength(4);
  expect(summary.walks.items.map((w: any) => w.duration_minutes)).toEqual([22, 27, 25, 30]);
  expect(summary.walks.items[0]).toHaveProperty('start_time');
  expect(summary.walks.items[0]).toHaveProperty('distance');

  // perWeek: 5 walks over ~2 weeks ≈ 2.5.
  expect(summary.walks.perWeek).toBeCloseTo(2.5, 1);
});

it('perWeek guards divide-by-zero for an inverted/zero window → 0', async () => {
  authState.session = { user: { id: OWNER.authUserId } };
  // to < from → windowMs <= 0 → perWeek must be 0, never NaN/Infinity (no walks match anyway).
  const res = await api.request(
    `/vet-record/full-summary?petId=${OWNER.petId}&from=2026-06-14&to=2026-06-01`,
  );
  expect(res.status).toBe(200);
  const { summary } = await res.json();
  expect(summary.walks.perWeek).toBe(0);
});
