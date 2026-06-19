// Ticket 2.74 — community EVENTS / meetups, proven on the REAL tables AS pawpi_app.
//
// events (0060): any authed user reads a published, non-deleted event; the host also sees their own
// (any status); INSERT as host; UPDATE/DELETE host-only. event_rsvps: a user reads RSVPs of a visible
// event + always their own; writes only their OWN rsvp, only on a published, non-deleted event.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser } from './db';

const H = { authUserId: 1, profileId: 1, username: 'hosth', petId: 1, petName: 'Rex' };
const A = { authUserId: 2, profileId: 2, username: 'attendeea' };
const B = { authUserId: 3, profileId: 3, username: 'attendeeb' };
const EV = 100;       // published event hosted by H
const CANCELLED = 101; // cancelled event hosted by H

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
  await seedOwnerWithPet(raw, H);
  await seedUser(raw, A);
  await seedUser(raw, B);
  await raw`insert into events (id, host_user_id, title, starts_at, status) values (${EV}, ${H.profileId}, 'Puppy Social', now() + interval '2 days', 'published')`;
  await raw`insert into events (id, host_user_id, title, starts_at, status) values (${CANCELLED}, ${H.profileId}, 'Cancelled', now() + interval '3 days', 'cancelled')`;
});

describe('events read/write RLS', () => {
  it('any authed user reads the published event; the host also sees their cancelled one', async () => {
    await asApp(A.profileId, async (tx) => expect(ids(await tx`select id from events`)).toEqual([EV]));
    await asApp(B.profileId, async (tx) => expect(ids(await tx`select id from events`)).toEqual([EV]));
    await asApp(H.profileId, async (tx) => expect(ids(await tx`select id from events`)).toEqual([EV, CANCELLED]));
    await asApp(null, async (tx) => expect(await tx`select id from events`).toHaveLength(0));
  });

  it('the host creates an event; a non-host cannot forge one as the host', async () => {
    await asApp(H.profileId, async (tx) => {
      const r = await tx`insert into events (host_user_id, title, starts_at) values (${H.profileId}, 'Mine', now()) returning id`;
      expect(r).toHaveLength(1);
    });
    await expect(
      asApp(A.profileId, (tx) => tx`insert into events (host_user_id, title, starts_at) values (${H.profileId}, 'Forged', now())`),
    ).rejects.toThrow(/row-level security/i);
  });

  it('only the host can edit / soft-delete their event', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(await tx`update events set title = 'Hacked' where id = ${EV} returning id`).toHaveLength(0);
    });
    await asApp(H.profileId, async (tx) => {
      expect(await tx`update events set status = 'cancelled' where id = ${EV} returning id`).toHaveLength(1);
    });
  });
});

describe('event_rsvps RLS', () => {
  it('a user RSVPs to the published event; the count is visible to all', async () => {
    await asApp(A.profileId, async (tx) => {
      const r = await tx`insert into event_rsvps (event_id, user_profile_id, status) values (${EV}, ${A.profileId}, 'going') returning id`;
      expect(r).toHaveLength(1);
    });
    // B can count the attendees of the published event
    await asApp(B.profileId, async (tx) => {
      const [{ n }] = await tx`select count(*)::int as n from event_rsvps where event_id = ${EV}`;
      expect(n).toBe(1);
    });
  });

  it('a user CANNOT write another user\'s rsvp', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`insert into event_rsvps (event_id, user_profile_id) values (${EV}, ${A.profileId})`),
    ).rejects.toThrow(/row-level security/i);
  });

  it('a user CANNOT RSVP to a cancelled event', async () => {
    await expect(
      asApp(A.profileId, (tx) => tx`insert into event_rsvps (event_id, user_profile_id) values (${CANCELLED}, ${A.profileId})`),
    ).rejects.toThrow(/row-level security/i);
  });

  it('toggling re-uses the single rsvp row (UNIQUE) — going → not_going', async () => {
    await asApp(A.profileId, async (tx) => {
      await tx`insert into event_rsvps (event_id, user_profile_id, status) values (${EV}, ${A.profileId}, 'going')`;
      const r = await tx`update event_rsvps set status = 'not_going' where event_id = ${EV} and user_profile_id = ${A.profileId} returning status`;
      expect(r[0].status).toBe('not_going');
    });
    const [{ n }] = await raw`select count(*)::int as n from event_rsvps where event_id = ${EV} and user_profile_id = ${A.profileId}`;
    expect(n).toBe(1);
  });
});

// Ticket 2.80 — the new event_rsvps.calendar_event_id column (migration 0063) rides the
// existing own-row INSERT/UPDATE policies: a user can set + read their OWN device calendar
// event id, but can never write another user's.
describe('event_rsvps.calendar_event_id (2.80) — per-attendee, own-row write', () => {
  it('a user sets + reads their OWN rsvp calendar_event_id', async () => {
    await asApp(A.profileId, async (tx) => {
      await tx`insert into event_rsvps (event_id, user_profile_id, status, calendar_event_id) values (${EV}, ${A.profileId}, 'going', 'evt-A')`;
      const r = await tx`select calendar_event_id from event_rsvps where event_id = ${EV} and user_profile_id = ${A.profileId}`;
      expect(r[0].calendar_event_id).toBe('evt-A');
    });
  });

  it("a user CANNOT INSERT an rsvp (with a calendar_event_id) for another user", async () => {
    await expect(
      asApp(B.profileId, (tx) =>
        tx`insert into event_rsvps (event_id, user_profile_id, status, calendar_event_id) values (${EV}, ${A.profileId}, 'going', 'evt-x')`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("a user CANNOT UPDATE another user's calendar_event_id (own-row UPDATE → zero rows)", async () => {
    await raw`insert into event_rsvps (event_id, user_profile_id, status) values (${EV}, ${A.profileId}, 'going')`;
    await asApp(B.profileId, async (tx) => {
      const upd = await tx`update event_rsvps set calendar_event_id = 'hacked' where event_id = ${EV} and user_profile_id = ${A.profileId} returning id`;
      expect(upd).toHaveLength(0);
    });
    const [{ calendar_event_id }] = await raw`select calendar_event_id from event_rsvps where event_id = ${EV} and user_profile_id = ${A.profileId}`;
    expect(calendar_event_id).toBeNull();
  });
});
