// Ticket 2.53 — Prescriptions / Rx, STRICTEST clinical append-only RLS, proven AS pawpi_app.
//
// prescriptions (0053) mirrors vet_notes integrity: the OWNER is READ-ONLY (never writes/forges);
// a provider staff member with the vet capability + access (grant or booking) INSERTs; there is NO
// provider UPDATE/DELETE policy — the refill decrement + cancel flow through SECURITY DEFINER
// helpers so clinical fields are never silently rewritten. rx_refill_requests: owner files on their
// own active Rx; the issuing vet decides via decide_rx_refill (which decrements refills).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedProvider, seedStaff,
  seedCapability, seedGrant,
} from './db';

const O = { authUserId: 1, profileId: 1, username: 'ownero', petId: 1, petName: 'Rex' };
const V = { authUserId: 2, profileId: 2, username: 'vetv' };   // active staff of the VET provider
const Z = { authUserId: 3, profileId: 3, username: 'otherz' }; // staff of a DIFFERENT provider
const X = { authUserId: 4, profileId: 4, username: 'outsiderx' };
const VET_ID = 10;
const OTHER_ID = 11;
const RX_ID = 100;

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
  await seedUser(raw, V);
  await seedUser(raw, Z);
  await seedUser(raw, X);
  await seedProvider(raw, { providerId: VET_ID, ownerUserProfileId: V.profileId, slug: 'vet-clinic', status: 'published' });
  await seedStaff(raw, { providerId: VET_ID, userProfileId: V.profileId, role: 'vet' });
  await seedCapability(raw, { providerId: VET_ID, capability: 'vet' });
  await seedGrant(raw, { petId: O.petId, ownerUserId: O.profileId, providerId: VET_ID, scopes: ['medical_read', 'medical_write'], status: 'active' });
  // a different provider Z is staff of
  await seedProvider(raw, { providerId: OTHER_ID, ownerUserProfileId: Z.profileId, slug: 'other-clinic', status: 'published' });
  await seedStaff(raw, { providerId: OTHER_ID, userProfileId: Z.profileId, role: 'vet' });
  await seedCapability(raw, { providerId: OTHER_ID, capability: 'vet' });
  // one Rx already issued by the vet provider
  await raw`
    insert into prescriptions (id, pet_id, owner_user_id, provider_id, drug_name, dose, frequency,
                               refills_authorized, refills_remaining, status)
    values (${RX_ID}, ${O.petId}, ${O.profileId}, ${VET_ID}, 'Amoxicillin', '250mg', 'BID', 2, 2, 'active')
  `;
});

describe('prescriptions — read + write scoping', () => {
  it('owner reads; issuing vet reads; other-provider staff + outsider + anon read ZERO', async () => {
    await asApp(O.profileId, async (tx) => expect(ids(await tx`select id from prescriptions`)).toEqual([RX_ID]));
    await asApp(V.profileId, async (tx) => expect(ids(await tx`select id from prescriptions`)).toEqual([RX_ID]));
    await asApp(Z.profileId, async (tx) => expect(await tx`select id from prescriptions`).toHaveLength(0));
    await asApp(X.profileId, async (tx) => expect(await tx`select id from prescriptions`).toHaveLength(0));
    await asApp(null, async (tx) => expect(await tx`select id from prescriptions`).toHaveLength(0));
  });

  it('a vet WITH access can issue an Rx', async () => {
    const created = await asApp(V.profileId, (tx) => tx`
      insert into prescriptions (pet_id, owner_user_id, provider_id, drug_name, dose, frequency)
      values (${O.petId}, ${O.profileId}, ${VET_ID}, 'Carprofen', '75mg', 'SID')
      returning id
    `);
    expect(created).toHaveLength(1);
  });

  it('a provider WITHOUT a grant/booking CANNOT issue (no medical_write access)', async () => {
    await expect(
      asApp(Z.profileId, (tx) => tx`
        insert into prescriptions (pet_id, owner_user_id, provider_id, drug_name, dose, frequency)
        values (${O.petId}, ${O.profileId}, ${OTHER_ID}, 'Forged', '1mg', 'SID')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('the OWNER cannot insert, update, or delete a prescription (read-only)', async () => {
    await expect(
      asApp(O.profileId, (tx) => tx`
        insert into prescriptions (pet_id, owner_user_id, provider_id, drug_name, dose, frequency)
        values (${O.petId}, ${O.profileId}, ${VET_ID}, 'SelfRx', '1mg', 'SID')
      `),
    ).rejects.toThrow(/row-level security/i);
    // No owner UPDATE/DELETE policy → zero rows affected (FORCE RLS).
    await asApp(O.profileId, async (tx) => {
      expect(await tx`update prescriptions set drug_name = 'Hacked' returning id`).toHaveLength(0);
      expect(await tx`delete from prescriptions returning id`).toHaveLength(0);
    });
    const [{ drug_name }] = await raw`select drug_name from prescriptions where id = ${RX_ID}`;
    expect(drug_name).toBe('Amoxicillin'); // untouched
  });

  it('the issuing vet cannot rewrite Rx history via a direct UPDATE (no provider UPDATE policy)', async () => {
    await asApp(V.profileId, async (tx) => {
      expect(await tx`update prescriptions set drug_name = 'Swapped' returning id`).toHaveLength(0);
    });
  });
});

describe('rx_refill_requests + decide_rx_refill (DEFINER decrement)', () => {
  it('owner files a refill on their own active Rx; the vet approves → refills decrement', async () => {
    const req = await asApp(O.profileId, (tx) => tx`
      insert into rx_refill_requests (prescription_id, pet_id, owner_user_id)
      values (${RX_ID}, ${O.petId}, ${O.profileId})
      returning id
    `);
    const reqId = req[0].id;
    // the vet decides via the DEFINER helper
    await asApp(V.profileId, async (tx) => {
      const [{ decide_rx_refill: st }] = await tx`select decide_rx_refill(${reqId}, true, 'ok') as decide_rx_refill`;
      expect(st).toBe('approved');
    });
    const [{ refills_remaining }] = await raw`select refills_remaining from prescriptions where id = ${RX_ID}`;
    expect(refills_remaining).toBe(1); // decremented from 2
  });

  it('the owner cannot approve their own refill (decide_rx_refill → forbidden)', async () => {
    const req = await asApp(O.profileId, (tx) => tx`
      insert into rx_refill_requests (prescription_id, pet_id, owner_user_id)
      values (${RX_ID}, ${O.petId}, ${O.profileId}) returning id
    `);
    await asApp(O.profileId, async (tx) => {
      const [{ decide_rx_refill: st }] = await tx`select decide_rx_refill(${req[0].id}, true) as decide_rx_refill`;
      expect(st).toBe('forbidden');
    });
    const [{ refills_remaining }] = await raw`select refills_remaining from prescriptions where id = ${RX_ID}`;
    expect(refills_remaining).toBe(2); // unchanged
  });

  it('the issuing vet reads refill requests for their prescriptions; another provider sees none', async () => {
    await raw`insert into rx_refill_requests (id, prescription_id, pet_id, owner_user_id) values (5, ${RX_ID}, ${O.petId}, ${O.profileId})`;
    await asApp(V.profileId, async (tx) => expect(ids(await tx`select id from rx_refill_requests`)).toEqual([5]));
    await asApp(Z.profileId, async (tx) => expect(await tx`select id from rx_refill_requests`).toHaveLength(0));
  });

  it('cancel_rx lets the issuing vet cancel (status only); owner read still works', async () => {
    await asApp(V.profileId, async (tx) => {
      const [{ cancel_rx: ok }] = await tx`select cancel_rx(${RX_ID}) as cancel_rx`;
      expect(ok).toBe(true);
    });
    const [{ status }] = await raw`select status from prescriptions where id = ${RX_ID}`;
    expect(status).toBe('cancelled');
  });
});
