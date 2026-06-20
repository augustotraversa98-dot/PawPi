// RLS — business calendar IMPORT (Wave 9 ticket 2.84), proven on the REAL tables AS pawpi_app.
//
// provider_calendar_feeds: owner|admin FOR ALL + active-staff SELECT.
// provider_calendar_busy:  active-staff SELECT only — NO write policy, so busy is READ-ONLY in
//                          PawPi (the only writer is the SECURITY DEFINER app_sync_calendar_feed).
// DEFINER fns: app_active_calendar_feeds (cron enumerate), app_sync_calendar_feed (replace busy +
//   stamp last_synced_at), app_remove_calendar_feed (soft-delete feed + clear busy),
//   app_provider_busy_windows (public availability/book subtract — only free/busy ranges).
//
// Proves: cross-provider isolation (B can't read A's feed/busy); busy is read-only (direct
// UPDATE/DELETE no-op, INSERT denied); the DEFINER sync writes busy and the busy-window fn returns
// overlapping ranges (== the book route's 409 source); removing a feed clears its blocks.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedUser, seedProvider, seedStaff } from './db';

const OWNER1 = { authUserId: 10, profileId: 10, username: 'biz1' };
const OWNER2 = { authUserId: 30, profileId: 30, username: 'biz2' };
const OUTSIDER = { authUserId: 13, profileId: 13, username: 'outsider' };
const P1 = 1;
const P2 = 2;
const FEED1 = 100;

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}

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
});

afterAll(async () => {
  await app.end();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
});

beforeEach(async () => {
  for (const u of [OWNER1, OWNER2, OUTSIDER]) await seedUser(raw, u);
  await seedProvider(raw, { providerId: P1, ownerUserProfileId: OWNER1.profileId, slug: 'clinic-1' });
  await seedProvider(raw, { providerId: P2, ownerUserProfileId: OWNER2.profileId, slug: 'clinic-2' });
  await seedStaff(raw, { providerId: P1, userProfileId: OWNER1.profileId, role: 'owner' });
  await seedStaff(raw, { providerId: P2, userProfileId: OWNER2.profileId, role: 'owner' });
  // Seed a feed for P1 (raw = superuser, bypasses RLS).
  await raw`
    insert into provider_calendar_feeds (id, provider_id, ics_url)
    values (${FEED1}, ${P1}, 'https://cal/p1.ics')
  `;
  await raw`select setval(pg_get_serial_sequence('provider_calendar_feeds','id'), ${FEED1})`;
});

describe('calendar-import RLS', () => {
  it('owner reads their feeds; another provider and an outsider read ZERO', async () => {
    const own = await asApp(OWNER1.profileId, (tx) => tx`select id from provider_calendar_feeds`);
    expect(own.map((r: any) => r.id)).toEqual([FEED1]);

    const other = await asApp(OWNER2.profileId, (tx) => tx`select id from provider_calendar_feeds`);
    expect(other).toHaveLength(0);

    const outsider = await asApp(OUTSIDER.profileId, (tx) => tx`select id from provider_calendar_feeds`);
    expect(outsider).toHaveLength(0);
  });

  it('owner can add a feed; an outsider cannot', async () => {
    const added = await asApp(OWNER1.profileId, (tx) =>
      tx`insert into provider_calendar_feeds (provider_id, ics_url)
         values (${P1}, 'https://cal/extra.ics') returning id`,
    );
    expect(added).toHaveLength(1);

    await expect(
      asApp(OUTSIDER.profileId, (tx) =>
        tx`insert into provider_calendar_feeds (provider_id, ics_url)
           values (${P1}, 'https://cal/hack.ics') returning id`,
      ),
    ).rejects.toThrow();
  });

  it('the DEFINER sync writes busy; busy is read-only and owner-isolated', async () => {
    const events = [
      { starts_at: '2026-07-01T13:00:00.000Z', ends_at: '2026-07-01T14:00:00.000Z', source_uid: 'e1' },
      { starts_at: '2026-07-02T09:00:00.000Z', ends_at: '2026-07-02T10:00:00.000Z', source_uid: 'e2' },
    ];
    const written = await asApp(null, (tx) => tx`select app_sync_calendar_feed(${FEED1}, ${tx.json(events)}::jsonb) as n`);
    expect(written[0].n).toBe(2);

    // owner sees both busy rows; provider B sees none.
    const ownBusy = await asApp(OWNER1.profileId, (tx) => tx`select id from provider_calendar_busy`);
    expect(ownBusy).toHaveLength(2);
    const bBusy = await asApp(OWNER2.profileId, (tx) => tx`select id from provider_calendar_busy`);
    expect(bBusy).toHaveLength(0);

    // busy is READ-ONLY: direct UPDATE/DELETE are no-ops (no write policy under FORCE RLS)…
    await asApp(OWNER1.profileId, async (tx) => {
      expect(await tx`update provider_calendar_busy set source_uid = 'x' returning id`).toHaveLength(0);
      expect(await tx`delete from provider_calendar_busy returning id`).toHaveLength(0);
    });
    // …and an owner can't INSERT a busy row directly.
    await expect(
      asApp(OWNER1.profileId, (tx) =>
        tx`insert into provider_calendar_busy (provider_id, feed_id, starts_at, ends_at)
           values (${P1}, ${FEED1}, now(), now() + interval '1 hour') returning id`,
      ),
    ).rejects.toThrow();
    // still intact
    const after = await asApp(OWNER1.profileId, (tx) => tx`select id from provider_calendar_busy`);
    expect(after).toHaveLength(2);
  });

  it('app_provider_busy_windows returns overlapping ranges (the book-route 409 source)', async () => {
    const events = [
      { starts_at: '2026-07-01T13:00:00.000Z', ends_at: '2026-07-01T14:00:00.000Z' },
    ];
    await asApp(null, (tx) => tx`select app_sync_calendar_feed(${FEED1}, ${tx.json(events)}::jsonb)`);

    // a booking request overlapping the busy block → a row (== unbookable)
    const overlap = await asApp(null, (tx) =>
      tx`select * from app_provider_busy_windows(${P1}, '2026-07-01T13:30:00.000Z'::timestamptz, '2026-07-01T13:45:00.000Z'::timestamptz)`,
    );
    expect(overlap).toHaveLength(1);
    // a request that doesn't overlap → nothing (bookable)
    const free = await asApp(null, (tx) =>
      tx`select * from app_provider_busy_windows(${P1}, '2026-07-01T15:00:00.000Z'::timestamptz, '2026-07-01T15:30:00.000Z'::timestamptz)`,
    );
    expect(free).toHaveLength(0);
  });

  it('removing a feed soft-deletes it and clears its busy blocks', async () => {
    const events = [
      { starts_at: '2026-07-01T13:00:00.000Z', ends_at: '2026-07-01T14:00:00.000Z' },
    ];
    await asApp(null, (tx) => tx`select app_sync_calendar_feed(${FEED1}, ${tx.json(events)}::jsonb)`);
    await asApp(null, (tx) => tx`select app_remove_calendar_feed(${FEED1})`);

    // busy gone; the busy-window fn returns nothing for the (now inactive) feed
    const windows = await asApp(null, (tx) =>
      tx`select * from app_provider_busy_windows(${P1}, '2026-07-01T00:00:00.000Z'::timestamptz, '2026-07-02T00:00:00.000Z'::timestamptz)`,
    );
    expect(windows).toHaveLength(0);
    // feed soft-deleted (history preserved), so the active-only feed list is empty
    const feeds = await asApp(OWNER1.profileId, (tx) =>
      tx`select id from provider_calendar_feeds where deleted_at is null`,
    );
    expect(feeds).toHaveLength(0);
  });
});
