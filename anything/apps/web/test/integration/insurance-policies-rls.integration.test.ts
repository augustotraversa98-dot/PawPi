// Ticket 2.72 — Insurance in-app BINDING, proven on the REAL tables AS pawpi_app.
//
// insurance_policies (0058) is money/contract-strict:
//   • OWNER creates/reads OWN applications; cannot self-issue a policy_number/premium and cannot set
//     'active' (RLS pins owner writes to application|cancelled with null number/premium).
//   • active STAFF of the INSURER read + issue/advance, but CANNOT plain-UPDATE to 'active'.
//   • activate_insurance_policy() is the ONLY path to 'active' and requires an APPROVED 2.3 payment
//     tied to the policy's owner+insurer.
//   • other-provider staff + outsiders → ZERO.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet, seedUser, seedProvider, seedStaff, seedCapability } from './db';

const O = { authUserId: 1, profileId: 1, username: 'ownero', petId: 1, petName: 'Rex' };
const I = { authUserId: 2, profileId: 2, username: 'insureri' }; // insurer admin staff
const Z = { authUserId: 3, profileId: 3, username: 'otherz' };   // other-provider staff
const X = { authUserId: 4, profileId: 4, username: 'outsiderx' };
const INS_ID = 10;
const OTHER_ID = 11;
const PLAN_ID = 100;
const POL_ID = 200;
const ORDER_ID = 300;
const PAY_ID = 400;

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
  await raw`insert into insurance_plans (id, provider_id, name, published) values (${PLAN_ID}, ${INS_ID}, 'Gold', true)`;
});

describe('insurance_policies create / owner RLS', () => {
  it('owner creates an application (no number/premium, status application)', async () => {
    const created = await asApp(O.profileId, (tx) => tx`
      insert into insurance_policies (plan_id, provider_id, owner_user_id, pet_id, status, terms_accepted_at)
      values (${PLAN_ID}, ${INS_ID}, ${O.profileId}, ${O.petId}, 'application', now())
      returning id
    `);
    expect(created).toHaveLength(1);
  });

  it('owner CANNOT self-issue a policy_number/premium', async () => {
    await expect(
      asApp(O.profileId, (tx) => tx`
        insert into insurance_policies (plan_id, provider_id, owner_user_id, status, policy_number, premium_cents)
        values (${PLAN_ID}, ${INS_ID}, ${O.profileId}, 'application', 'POL-1', 5000)
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('owner CANNOT create an already-active policy', async () => {
    await expect(
      asApp(O.profileId, (tx) => tx`
        insert into insurance_policies (plan_id, provider_id, owner_user_id, status)
        values (${PLAN_ID}, ${INS_ID}, ${O.profileId}, 'active')
      `),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('insurance_policies issue / read RLS', () => {
  beforeEach(async () => {
    await raw`
      insert into insurance_policies (id, plan_id, provider_id, owner_user_id, pet_id, status, terms_accepted_at)
      values (${POL_ID}, ${PLAN_ID}, ${INS_ID}, ${O.profileId}, ${O.petId}, 'application', now())
    `;
  });

  it('owner + insurer staff read; other-provider staff + outsider + anon read ZERO', async () => {
    await asApp(O.profileId, async (tx) => expect(ids(await tx`select id from insurance_policies`)).toEqual([POL_ID]));
    await asApp(I.profileId, async (tx) => expect(ids(await tx`select id from insurance_policies`)).toEqual([POL_ID]));
    await asApp(Z.profileId, async (tx) => expect(await tx`select id from insurance_policies`).toHaveLength(0));
    await asApp(X.profileId, async (tx) => expect(await tx`select id from insurance_policies`).toHaveLength(0));
    await asApp(null, async (tx) => expect(await tx`select id from insurance_policies`).toHaveLength(0));
  });

  it('insurer staff issue a number + premium and advance to payment_pending', async () => {
    await asApp(I.profileId, async (tx) => {
      const r = await tx`
        update insurance_policies set policy_number = 'POL-9', premium_cents = 5000, billing_period = 'monthly', status = 'payment_pending'
        where id = ${POL_ID} returning policy_number, premium_cents, status
      `;
      expect(r[0]).toMatchObject({ policy_number: 'POL-9', premium_cents: 5000, status: 'payment_pending' });
    });
  });

  it('insurer staff CANNOT plain-UPDATE to active (reserved for the safe path)', async () => {
    await expect(
      asApp(I.profileId, (tx) => tx`update insurance_policies set status = 'active' where id = ${POL_ID} returning id`),
    ).rejects.toThrow(/row-level security/i);
  });

  it('owner CANNOT set status active directly', async () => {
    await expect(
      asApp(O.profileId, (tx) => tx`update insurance_policies set status = 'active' where id = ${POL_ID} returning id`),
    ).rejects.toThrow(/row-level security/i);
  });

  it('owner can cancel', async () => {
    await asApp(O.profileId, async (tx) => {
      expect(await tx`update insurance_policies set status = 'cancelled' where id = ${POL_ID} returning id`).toHaveLength(1);
    });
  });

  it('other-provider staff update ZERO', async () => {
    await asApp(Z.profileId, async (tx) => {
      expect(await tx`update insurance_policies set status = 'lapsed' where id = ${POL_ID} returning id`).toHaveLength(0);
    });
  });
});

describe('activate_insurance_policy safe path', () => {
  beforeEach(async () => {
    await raw`
      insert into insurance_policies (id, plan_id, provider_id, owner_user_id, pet_id, status, premium_cents, policy_number)
      values (${POL_ID}, ${PLAN_ID}, ${INS_ID}, ${O.profileId}, ${O.petId}, 'payment_pending', 5000, 'POL-9')
    `;
    await raw`insert into orders (id, owner_user_id, provider_id, kind, amount_cents, status) values (${ORDER_ID}, ${O.profileId}, ${INS_ID}, 'subscription', 5000, 'paid')`;
    await raw`insert into payments (id, order_id, rail, status, amount_cents) values (${PAY_ID}, ${ORDER_ID}, 'mercadopago', 'approved', 5000)`;
  });

  it('an approved payment activates the policy (owner-triggered)', async () => {
    await asApp(O.profileId, async (tx) => {
      const [{ result }] = await tx`select activate_insurance_policy(${POL_ID}, ${PAY_ID}) as result`;
      expect(result).toBe('active');
    });
    const [{ status }] = await raw`select status from insurance_policies where id = ${POL_ID}`;
    expect(status).toBe('active');
  });

  it('an unapproved payment does NOT activate', async () => {
    await raw`update payments set status = 'pending' where id = ${PAY_ID}`;
    await asApp(O.profileId, async (tx) => {
      const [{ result }] = await tx`select activate_insurance_policy(${POL_ID}, ${PAY_ID}) as result`;
      expect(result).toBe('payment_not_approved');
    });
    const [{ status }] = await raw`select status from insurance_policies where id = ${POL_ID}`;
    expect(status).toBe('payment_pending'); // untouched
  });

  it('a stranger cannot activate (DEFINER forbidden)', async () => {
    await asApp(X.profileId, async (tx) => {
      const [{ result }] = await tx`select activate_insurance_policy(${POL_ID}, ${PAY_ID}) as result`;
      expect(result).toBe('forbidden');
    });
  });

  it('activating twice is idempotent — second call returns not_bindable, no re-bind', async () => {
    await asApp(O.profileId, async (tx) => {
      const [{ result }] = await tx`select activate_insurance_policy(${POL_ID}, ${PAY_ID}) as result`;
      expect(result).toBe('active');
    });
    // Already-active policy is no longer bindable — a re-trigger can't double-bind/re-pay.
    await asApp(O.profileId, async (tx) => {
      const [{ result }] = await tx`select activate_insurance_policy(${POL_ID}, ${PAY_ID}) as result`;
      expect(result).toBe('not_bindable');
    });
    const [{ status, payment_id }] = await raw`select status, payment_id from insurance_policies where id = ${POL_ID}`;
    expect(status).toBe('active');
    expect(payment_id).toBe(PAY_ID); // bound once
  });

  it('activating an unknown policy returns not_found', async () => {
    await asApp(O.profileId, async (tx) => {
      const [{ result }] = await tx`select activate_insurance_policy(999999, ${PAY_ID}) as result`;
      expect(result).toBe('not_found');
    });
  });
});
