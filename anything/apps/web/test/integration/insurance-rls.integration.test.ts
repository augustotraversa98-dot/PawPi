// Ticket 2.54 — Insurance MARKETPLACE, proven on the REAL tables AS pawpi_app.
//
// insurance_plans (0054): admin-managed catalog; a PUBLISHED plan of a PUBLISHED provider is
// any-authed readable (the public marketplace); active staff additionally see unpublished. Modeled
// on provider_services (0024). insurance_leads: owner-or-provider scoped — the owner reads/creates
// own, the targeted provider's active staff read + status-update; other-provider/outsider → zero.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedProvider, seedStaff, seedCapability } from './db';

const O = { authUserId: 1, profileId: 1, username: 'ownero', petId: 1, petName: 'Rex' };
const I = { authUserId: 2, profileId: 2, username: 'insureri' }; // admin staff of the insurer
const Z = { authUserId: 3, profileId: 3, username: 'otherz' };   // staff of a different provider
const X = { authUserId: 4, profileId: 4, username: 'outsiderx' };
const INS_ID = 10;
const OTHER_ID = 11;
const PUB_PLAN = 100;
const DRAFT_PLAN = 101;
const LEAD_ID = 200;

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
  await seedOwnerWithPet(raw, O);
  await seedUser(raw, I);
  await seedUser(raw, Z);
  await seedUser(raw, X);
  await seedProvider(raw, { providerId: INS_ID, ownerUserProfileId: I.profileId, slug: 'pawsure', status: 'published' });
  await seedStaff(raw, { providerId: INS_ID, userProfileId: I.profileId, role: 'owner' });
  await seedCapability(raw, { providerId: INS_ID, capability: 'insurance' });
  await seedProvider(raw, { providerId: OTHER_ID, ownerUserProfileId: Z.profileId, slug: 'other-co', status: 'published' });
  await seedStaff(raw, { providerId: OTHER_ID, userProfileId: Z.profileId, role: 'owner' });
  await raw`insert into insurance_plans (id, provider_id, name, published) values (${PUB_PLAN}, ${INS_ID}, 'Gold', true)`;
  await raw`insert into insurance_plans (id, provider_id, name, published) values (${DRAFT_PLAN}, ${INS_ID}, 'Draft', false)`;
  await raw`insert into insurance_leads (id, provider_id, owner_user_id, plan_id, note) values (${LEAD_ID}, ${INS_ID}, ${O.profileId}, ${PUB_PLAN}, 'interested')`;
});

describe('insurance_plans — published-public read + staff-managed write', () => {
  it('any authed user reads a PUBLISHED plan; only staff see the unpublished one', async () => {
    await asApp(X.profileId, async (tx) => expect(ids(await tx`select id from insurance_plans`)).toEqual([PUB_PLAN]));
    await asApp(O.profileId, async (tx) => expect(ids(await tx`select id from insurance_plans`)).toEqual([PUB_PLAN]));
    await asApp(I.profileId, async (tx) => expect(ids(await tx`select id from insurance_plans`)).toEqual([PUB_PLAN, DRAFT_PLAN]));
  });

  it('an insurer admin can create + publish a plan; an owner cannot', async () => {
    await asApp(I.profileId, async (tx) => {
      const created = await tx`insert into insurance_plans (provider_id, name, published) values (${INS_ID}, 'Silver', true) returning id`;
      expect(created).toHaveLength(1);
    });
    await expect(
      asApp(O.profileId, (tx) => tx`insert into insurance_plans (provider_id, name) values (${INS_ID}, 'Forged')`),
    ).rejects.toThrow(/row-level security/i);
  });

  it('an owner cannot edit a plan (zero rows under FORCE RLS)', async () => {
    await asApp(O.profileId, async (tx) => {
      expect(await tx`update insurance_plans set name = 'Hacked' returning id`).toHaveLength(0);
    });
  });
});

describe('insurance_leads — owner-or-provider scoped', () => {
  it('owner reads own; insurer staff reads; other-provider staff + outsider read ZERO', async () => {
    await asApp(O.profileId, async (tx) => expect(ids(await tx`select id from insurance_leads`)).toEqual([LEAD_ID]));
    await asApp(I.profileId, async (tx) => expect(ids(await tx`select id from insurance_leads`)).toEqual([LEAD_ID]));
    await asApp(Z.profileId, async (tx) => expect(await tx`select id from insurance_leads`).toHaveLength(0));
    await asApp(X.profileId, async (tx) => expect(await tx`select id from insurance_leads`).toHaveLength(0));
  });

  it('owner creates their own lead', async () => {
    const created = await asApp(O.profileId, (tx) => tx`
      insert into insurance_leads (provider_id, owner_user_id, plan_id, pet_species, note)
      values (${INS_ID}, ${O.profileId}, ${PUB_PLAN}, 'dog', 'quote please') returning id
    `);
    expect(created).toHaveLength(1);
  });

  it('the insurer staff updates the lead status; another provider updates ZERO', async () => {
    await asApp(I.profileId, async (tx) => {
      const r = await tx`update insurance_leads set status = 'contacted' where id = ${LEAD_ID} returning id, status`;
      expect(r[0].status).toBe('contacted');
    });
    await asApp(Z.profileId, async (tx) => {
      expect(await tx`update insurance_leads set status = 'closed' returning id`).toHaveLength(0);
    });
  });

  it('the owner cannot change a lead status (no owner UPDATE policy)', async () => {
    await asApp(O.profileId, async (tx) => {
      expect(await tx`update insurance_leads set status = 'closed' returning id`).toHaveLength(0);
    });
  });
});
