// AUDIT_2026-09 A-21 — POST /api/events/[id]/rsvp must not accept an arbitrary pet_id. RLS
// (event_rsvps_insert) pins user_profile_id only, so this is a ROUTE-level guard; proven on
// real Postgres through the real router as two different owners.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet } from './db';

const authState = vi.hoisted(() => ({ session: null as any }));
vi.mock('@/auth', () => ({ auth: async () => authState.session }));

const A = { authUserId: 1, profileId: 1, username: 'hosta', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'guestb', petId: 2, petName: 'Bella' };
const EV = 100;

let raw: Sql;
let app: Sql;
let api: any;

const rsvp = (eventId: number, body: unknown) =>
  api.request(`/events/${eventId}/rsvp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
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
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  await raw`insert into events (id, host_user_id, title, starts_at, status)
            values (${EV}, ${A.profileId}, 'Puppy Social', now() + interval '2 days', 'published')`;
});

afterAll(async () => {
  await resetDb(raw);
  authState.session = null;
  await app.end();
  await raw.end();
});

describe('RSVP pet ownership (A-21)', () => {
  it('the owner can RSVP with their own pet', async () => {
    authState.session = { user: { id: A.authUserId } };
    const res = await rsvp(EV, { status: 'going', pet_id: A.petId });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rsvp.pet_id).toBe(A.petId);
  });

  it("a second owner CANNOT RSVP with someone else's pet — 403, nothing written", async () => {
    authState.session = { user: { id: B.authUserId } };
    const res = await rsvp(EV, { status: 'going', pet_id: A.petId });
    expect(res.status).toBe(403);
    const [{ n }] = await raw<{ n: number }[]>`
      select count(*)::int as n from event_rsvps where event_id = ${EV} and user_profile_id = ${B.profileId}`;
    expect(n).toBe(0);
  });

  it('the second owner can still RSVP with their OWN pet, and without a pet', async () => {
    authState.session = { user: { id: B.authUserId } };
    expect((await rsvp(EV, { status: 'going', pet_id: B.petId })).status).toBe(200);
    expect((await rsvp(EV, { status: 'not_going' })).status).toBe(200);
  });
});
