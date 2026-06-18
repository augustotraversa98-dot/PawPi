// RLS for ticket 2.48 — Lost & Found — proven on the REAL tables AS pawpi_app.
//
// lost_reports: owner FOR ALL (activate/resolve); any authed user reads an ACTIVE report (the
// public alert); a resolved report is owner-only. lost_sightings: a reporter inserts on an
// active report (reporter = caller), SELECT by the report owner (all) or the reporter (own);
// append-only. Plus the notifications type CHECK now admits 'lost_alert'.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedOwnerWithPet,
  seedLostReport,
  seedLostSighting,
} from './db';

const OWNER = { authUserId: 1, profileId: 1, username: 'owner', petId: 1, petName: 'Rex' };
const FINDER = { authUserId: 2, profileId: 2, username: 'finder', petId: 2, petName: 'Bella' };
const OTHER = { authUserId: 3, profileId: 3, username: 'other', petId: 3, petName: 'Coco' };
const REPORT = 1;

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
    host: url.hostname, port: Number(url.port),
    database: url.pathname.replace(/^\//, ''),
    username: 'pawpi_app', password: 'pawpi_app', max: 1, onnotice: () => {},
  });
});
afterAll(async () => { await app.end(); await raw.end(); });
afterEach(async () => { await resetDb(raw); });

beforeEach(async () => {
  await seedOwnerWithPet(raw, OWNER);
  await seedOwnerWithPet(raw, FINDER);
  await seedOwnerWithPet(raw, OTHER);
});

describe('RLS 2.48 — lost_reports', () => {
  it('any authed user reads an ACTIVE alert (owner, finder, other)', async () => {
    await seedLostReport(raw, { id: REPORT, petId: OWNER.petId, ownerUserId: OWNER.profileId, status: 'active' });
    for (const uid of [OWNER.profileId, FINDER.profileId, OTHER.profileId]) {
      await asApp(uid, async (tx) => expect(ids(await tx`select id from lost_reports`)).toEqual([REPORT]));
    }
  });

  it('a RESOLVED report is visible only to its owner', async () => {
    await seedLostReport(raw, { id: REPORT, petId: OWNER.petId, ownerUserId: OWNER.profileId, status: 'resolved' });
    await asApp(OWNER.profileId, async (tx) => expect(ids(await tx`select id from lost_reports`)).toEqual([REPORT]));
    await asApp(FINDER.profileId, async (tx) => expect(await tx`select id from lost_reports`).toHaveLength(0));
  });

  it('no identity → zero (deny-by-default)', async () => {
    await seedLostReport(raw, { id: REPORT, petId: OWNER.petId, ownerUserId: OWNER.profileId });
    await asApp(null, async (tx) => expect(await tx`select id from lost_reports`).toHaveLength(0));
  });

  it('the owner activates + resolves; a non-owner cannot edit/resolve', async () => {
    await asApp(OWNER.profileId, async (tx) => {
      const r = await tx`
        insert into lost_reports (id, pet_id, owner_user_id, status)
        values (5, ${OWNER.petId}, ${OWNER.profileId}, 'active') returning id`;
      expect(r).toHaveLength(1);
    });
    await asApp(FINDER.profileId, async (tx) => {
      expect(await tx`update lost_reports set status = 'resolved' returning id`).toHaveLength(0);
    });
    await asApp(OWNER.profileId, async (tx) => {
      expect(await tx`update lost_reports set status = 'resolved', resolved_at = now() where id = 5 returning id`).toHaveLength(1);
    });
  });

  it('a non-owner cannot forge a report owned by someone else (WITH CHECK)', async () => {
    await expect(
      asApp(FINDER.profileId, (tx) => tx`
        insert into lost_reports (pet_id, owner_user_id, status)
        values (${OWNER.petId}, ${OWNER.profileId}, 'active')`),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('RLS 2.48 — lost_sightings', () => {
  beforeEach(async () => {
    await seedLostReport(raw, { id: REPORT, petId: OWNER.petId, ownerUserId: OWNER.profileId, status: 'active' });
  });

  it('any authed user reports a sighting on an active report (reporter = caller)', async () => {
    const created = await asApp(FINDER.profileId, (tx) => tx`
      insert into lost_sightings (id, lost_report_id, reporter_user_id, note)
      values (10, ${REPORT}, ${FINDER.profileId}, 'spotted near the park') returning id`);
    expect(created).toHaveLength(1);
  });

  it('a reporter cannot forge a sighting attributed to someone else (WITH CHECK)', async () => {
    await expect(
      asApp(FINDER.profileId, (tx) => tx`
        insert into lost_sightings (lost_report_id, reporter_user_id, note)
        values (${REPORT}, ${OTHER.profileId}, 'forged')`),
    ).rejects.toThrow(/row-level security/i);
  });

  it('a sighting cannot be added to a RESOLVED report', async () => {
    await seedLostReport(raw, { id: 2, petId: FINDER.petId, ownerUserId: FINDER.profileId, status: 'resolved' });
    await expect(
      asApp(OTHER.profileId, (tx) => tx`
        insert into lost_sightings (lost_report_id, reporter_user_id, note)
        values (2, ${OTHER.profileId}, 'too late')`),
    ).rejects.toThrow(/row-level security/i);
  });

  it('the report owner sees ALL sightings; a reporter sees only their own; an outsider sees none', async () => {
    await seedLostSighting(raw, { id: 10, reportId: REPORT, reporterUserId: FINDER.profileId });
    await seedLostSighting(raw, { id: 11, reportId: REPORT, reporterUserId: OTHER.profileId });
    await asApp(OWNER.profileId, async (tx) => expect(ids(await tx`select id from lost_sightings`)).toEqual([10, 11]));
    await asApp(FINDER.profileId, async (tx) => expect(ids(await tx`select id from lost_sightings`)).toEqual([10]));
    // A user who is neither owner nor a reporter on this report sees nothing of it.
    await seedLostReport(raw, { id: 3, petId: OTHER.petId, ownerUserId: OTHER.profileId, status: 'active' });
    await asApp(OTHER.profileId, async (tx) => expect(ids(await tx`select id from lost_sightings`)).toEqual([11]));
  });
});

describe('RLS 2.48 — notifications type widened for lost_alert', () => {
  it("app_notify accepts a 'lost_alert' notification", async () => {
    // app_notify is DEFINER; the widened CHECK must admit the new type.
    await asApp(OWNER.profileId, async (tx) => {
      const [{ app_notify: id }] = await tx`
        select app_notify(${FINDER.profileId}, ${OWNER.profileId}, 'lost_alert', '1', 'Rex is lost near Central Park')`;
      expect(id).not.toBeNull();
    });
  });
});
