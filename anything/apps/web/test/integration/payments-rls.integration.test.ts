// Payments money-table RLS (ticket 2.3 / migration 0029), proven on the REAL tables
// acting AS pawpi_app. Companion to pets-rls, owner-private-rls, provider-business-rls,
// care-access-rls, etc. MONEY = STRICTEST — every assertion is allowed-vs-ZERO.
//
// Cast:
//   A  — owner who PAYS (orders/payments/subscriptions for provider P)
//   B  — another owner (must see ZERO of A's money rows)
//   P  — the provider being paid; owned by SOWN, with active staff SSTF and a removed
//        ex-staffer SREM
//   Q  — a second provider (its staff SQ must see ZERO of P's orders/payouts)
//   D  — an authed outsider (no provider, no orders) → ZERO everywhere
//
// Critical properties (DO-NOT from the ticket):
//   1. owner isolation — A sees only A's orders/payments/subscriptions; B sees none.
//   2. provider-staff scope — P's active staff read P's orders/payments/payouts; not Q's.
//   3. no cross-leak — no owner reads another owner's; no provider reads another's.
//   4. tokens never owner-visible — provider_payment_accounts is provider-ADMIN only; A
//      (the payer) reads ZERO, even for the provider they paid.
//   5. payouts are provider-only — no owner branch at all (A reads ZERO payouts).
//
// As in the sibling suites: a SECOND porsager client AS pawpi_app (NOBYPASSRLS), identity
// set per transaction, allowed-vs-ZERO. The harness owner is superuser, so FORCE RLS
// constrains only pawpi_app.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedUser,
  seedProvider,
  seedStaff,
  seedPaymentAccount,
  seedOrder,
  seedOrderItem,
  seedPayment,
  seedPayout,
  seedSubscription,
} from './db';

const A = { authUserId: 1, profileId: 1, username: 'ownera' }; // payer
const B = { authUserId: 2, profileId: 2, username: 'ownerb' }; // other owner
const SOWN = { authUserId: 3, profileId: 3, username: 'sown' }; // P owner
const SSTF = { authUserId: 4, profileId: 4, username: 'sstf' }; // P active staff
const SREM = { authUserId: 5, profileId: 5, username: 'srem' }; // P removed staff
const SQ = { authUserId: 6, profileId: 6, username: 'sq' }; // Q active staff
const D = { authUserId: 7, profileId: 7, username: 'outsider' }; // authed outsider

const P = 10; // provider being paid
const Q = 20; // a different provider

const ORDER_A = 100; // A's order to P
const ORDER_B = 200; // B's order to P
const PAY_A = 1000; // payment on A's order
const PAY_B = 2000; // payment on B's order
const PAYOUT_P = 11; // P's payout
const PAYOUT_Q = 22; // Q's payout
const SUB_A = 300; // A's subscription to P
const ACCT_P = 1; // P's mercadopago account (token)

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
  // Identities.
  await seedUser(raw, A);
  await seedUser(raw, B);
  await seedUser(raw, SOWN);
  await seedUser(raw, SSTF);
  await seedUser(raw, SREM);
  await seedUser(raw, SQ);
  await seedUser(raw, D);

  // Providers + staff.
  await seedProvider(raw, { providerId: P, ownerUserProfileId: SOWN.profileId, slug: 'prov-p' });
  await seedStaff(raw, { providerId: P, userProfileId: SOWN.profileId, role: 'owner', status: 'active' });
  await seedStaff(raw, { providerId: P, userProfileId: SSTF.profileId, role: 'staff', status: 'active' });
  await seedStaff(raw, { providerId: P, userProfileId: SREM.profileId, role: 'staff', status: 'removed' });
  await seedProvider(raw, { providerId: Q, ownerUserProfileId: SQ.profileId, slug: 'prov-q' });
  await seedStaff(raw, { providerId: Q, userProfileId: SQ.profileId, role: 'owner', status: 'active' });

  // Money rows.
  await seedPaymentAccount(raw, { accountId: ACCT_P, providerId: P, rail: 'mercadopago', accessToken: 'TOPSECRET' });
  await seedOrder(raw, { orderId: ORDER_A, ownerUserId: A.profileId, providerId: P });
  await seedOrder(raw, { orderId: ORDER_B, ownerUserId: B.profileId, providerId: P });
  await seedOrderItem(raw, { itemId: 1, orderId: ORDER_A });
  await seedOrderItem(raw, { itemId: 2, orderId: ORDER_B });
  await seedPayment(raw, { paymentId: PAY_A, orderId: ORDER_A });
  await seedPayment(raw, { paymentId: PAY_B, orderId: ORDER_B });
  await seedPayout(raw, { payoutId: PAYOUT_P, providerId: P });
  await seedPayout(raw, { payoutId: PAYOUT_Q, providerId: Q });
  await seedSubscription(raw, { subscriptionId: SUB_A, ownerUserId: A.profileId, providerId: P });
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. provider_payment_accounts — provider ADMIN only; tokens NEVER owner-visible.
describe('RLS 2.3 — provider_payment_accounts (provider-admin only; tokens never owner-visible)', () => {
  it('provider owner|admin reads the account (incl. its token)', async () => {
    await asApp(SOWN.profileId, async (tx) => {
      const rows = await tx`select id, access_token from provider_payment_accounts`;
      expect(ids(rows)).toEqual([ACCT_P]);
      expect(rows[0].access_token).toBe('TOPSECRET');
    });
  });

  it('a non-admin active staff (staff role) reads ZERO accounts', async () => {
    // app_is_provider_admin requires role owner|admin — plain 'staff' is denied.
    await asApp(SSTF.profileId, async (tx) => {
      expect(await tx`select id from provider_payment_accounts`).toHaveLength(0);
    });
  });

  it('the PAYER (owner A) reads ZERO accounts — tokens never reach owners', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(await tx`select id from provider_payment_accounts`).toHaveLength(0);
    });
  });

  it('a different provider admin (SQ) reads ZERO of P\'s account', async () => {
    await asApp(SQ.profileId, async (tx) => {
      expect(await tx`select id from provider_payment_accounts`).toHaveLength(0);
    });
  });

  it('no identity → ZERO', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from provider_payment_accounts`).toHaveLength(0);
    });
  });

  it('owner A cannot INSERT a forged account for P (WITH CHECK reject)', async () => {
    await expect(
      asApp(A.profileId, (tx) => tx`
        insert into provider_payment_accounts (provider_id, rail, access_token, status)
        values (${P}, 'binance', 'forged', 'connected')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  // The payment layer's DEFINER reader (0072): the PAYING customer's checkout must be able to
  // load the provider's connected account (to build a split-payment checkout) WITHOUT weakening
  // the admin-only policy for direct reads. This is the fix for "provider hasn't connected
  // MercadoPago" firing on a genuinely-connected provider.
  it('DEFINER reader returns P\'s account to the PAYER (A) — the checkout path — while a direct read stays ZERO', async () => {
    await asApp(A.profileId, async (tx) => {
      // Direct read: still denied (invariant preserved).
      expect(await tx`select id from provider_payment_accounts`).toHaveLength(0);
      // DEFINER reader: returns the provider's account (incl. token) for the trusted layer.
      const rows = await tx`select * from app_get_provider_payment_account(${P}::int, 'mercadopago')`;
      expect(ids(rows)).toEqual([ACCT_P]);
      expect(rows[0].access_token).toBe('TOPSECRET');
      expect(rows[0].status).toBe('connected');
    });
  });

  it('DEFINER reader mirrors disconnect→reconnect: null token when disconnected, live token after reconnect', async () => {
    // Disconnect (what DELETE .../mercadopago does): clear tokens + status='disconnected'.
    await raw`
      update provider_payment_accounts
      set access_token = null, refresh_token = null, status = 'disconnected'
      where id = ${ACCT_P}
    `;
    await asApp(A.profileId, async (tx) => {
      const disc = await tx`select * from app_get_provider_payment_account(${P}::int, 'mercadopago')`;
      // Row is found, but no usable token → the layer's "not connected" branch fires (correct).
      expect(disc[0].access_token).toBeNull();
      expect(disc[0].status).toBe('disconnected');
    });
    // Reconnect (what the OAuth callback UPSERT does): fresh token + status='connected'.
    await raw`
      update provider_payment_accounts
      set access_token = 'FRESH_TOKEN', refresh_token = 'FRESH_REFRESH', status = 'connected'
      where id = ${ACCT_P}
    `;
    await asApp(A.profileId, async (tx) => {
      const recon = await tx`select * from app_get_provider_payment_account(${P}::int, 'mercadopago')`;
      // Now the checkout sees a connected account with a usable token.
      expect(recon[0].status).toBe('connected');
      expect(recon[0].access_token).toBe('FRESH_TOKEN');
    });
  });

  it('DEFINER reader returns ZERO rows for a provider with no account (clean not-connected)', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(await tx`select * from app_get_provider_payment_account(${Q}::int, 'mercadopago')`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. orders — owner sees own; provider active-staff see theirs; no cross-leak.
describe('RLS 2.3 — orders (owner isolation + provider-staff scope, no cross-leak)', () => {
  it('owner A reads ONLY A\'s order', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(ids(await tx`select id from orders`)).toEqual([ORDER_A]);
    });
  });

  it('owner B reads ONLY B\'s order (cannot see A\'s)', async () => {
    await asApp(B.profileId, async (tx) => {
      expect(ids(await tx`select id from orders`)).toEqual([ORDER_B]);
    });
  });

  it('P active staff (SSTF) read BOTH orders for P', async () => {
    await asApp(SSTF.profileId, async (tx) => {
      expect(ids(await tx`select id from orders`)).toEqual([ORDER_A, ORDER_B]);
    });
  });

  it('a REMOVED P staffer reads ZERO orders', async () => {
    await asApp(SREM.profileId, async (tx) => {
      expect(await tx`select id from orders`).toHaveLength(0);
    });
  });

  it('a DIFFERENT provider\'s staff (SQ) reads ZERO of P\'s orders', async () => {
    await asApp(SQ.profileId, async (tx) => {
      expect(await tx`select id from orders`).toHaveLength(0);
    });
  });

  it('an authed outsider (D) reads ZERO', async () => {
    await asApp(D.profileId, async (tx) => {
      expect(await tx`select id from orders`).toHaveLength(0);
    });
  });

  it('owner A creates their OWN order (WITH CHECK passes)', async () => {
    const created = await asApp(A.profileId, (tx) => tx`
      insert into orders (id, owner_user_id, provider_id, kind, amount_cents, currency, status)
      values (500, ${A.profileId}, ${P}, 'donation', 5000, 'ARS', 'pending')
      returning id, owner_user_id
    `);
    expect(created[0].owner_user_id).toBe(A.profileId);
  });

  it('owner B cannot create an order attributed to A (WITH CHECK reject)', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`
        insert into orders (owner_user_id, provider_id, kind, amount_cents, currency, status)
        values (${A.profileId}, ${P}, 'donation', 5000, 'ARS', 'pending')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('provider staff cannot UPDATE/DELETE an owner\'s order (owner-write only)', async () => {
    await asApp(SSTF.profileId, async (tx) => {
      expect(await tx`update orders set status = 'cancelled' returning id`).toHaveLength(0);
      expect(await tx`delete from orders returning id`).toHaveLength(0);
    });
    const [{ n }] = await raw`select count(*)::int as n from orders`;
    expect(n).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. order_items — visible to whoever can see the parent order.
describe('RLS 2.3 — order_items (parent-order visibility)', () => {
  it('owner A sees only A\'s item; B only B\'s', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(ids(await tx`select id from order_items`)).toEqual([1]);
    });
    await asApp(B.profileId, async (tx) => {
      expect(ids(await tx`select id from order_items`)).toEqual([2]);
    });
  });

  it('P active staff see BOTH items', async () => {
    await asApp(SSTF.profileId, async (tx) => {
      expect(ids(await tx`select id from order_items`)).toEqual([1, 2]);
    });
  });

  it('outsider D sees ZERO', async () => {
    await asApp(D.profileId, async (tx) => {
      expect(await tx`select id from order_items`).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. payments — same visibility as the parent order (the ledger).
describe('RLS 2.3 — payments (ledger; parent-order visibility)', () => {
  it('owner A sees only A\'s payment; B only B\'s', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(ids(await tx`select id from payments`)).toEqual([PAY_A]);
    });
    await asApp(B.profileId, async (tx) => {
      expect(ids(await tx`select id from payments`)).toEqual([PAY_B]);
    });
  });

  it('P active staff see BOTH payments', async () => {
    await asApp(SSTF.profileId, async (tx) => {
      expect(ids(await tx`select id from payments`)).toEqual([PAY_A, PAY_B]);
    });
  });

  it('a different provider\'s staff (SQ) see ZERO', async () => {
    await asApp(SQ.profileId, async (tx) => {
      expect(await tx`select id from payments`).toHaveLength(0);
    });
  });

  it('no identity → ZERO', async () => {
    await asApp(null, async (tx) => {
      expect(await tx`select id from payments`).toHaveLength(0);
    });
  });

  it('P active staff can UPDATE a payment status (webhook reconciliation path)', async () => {
    await asApp(SSTF.profileId, async (tx) => {
      const upd = await tx`update payments set status = 'approved' where id = ${PAY_A} returning id`;
      expect(upd).toHaveLength(1);
    });
  });

  it('DELETE is denied for everyone (append-only ledger)', async () => {
    await asApp(SSTF.profileId, async (tx) => {
      expect(await tx`delete from payments returning id`).toHaveLength(0);
    });
    await asApp(A.profileId, async (tx) => {
      expect(await tx`delete from payments returning id`).toHaveLength(0);
    });
    const [{ n }] = await raw`select count(*)::int as n from payments`;
    expect(n).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. payouts — provider-scoped ONLY. Owners NEVER see payouts.
describe('RLS 2.3 — payouts (provider-only; owners never see them)', () => {
  it('P active staff read ONLY P\'s payout', async () => {
    await asApp(SSTF.profileId, async (tx) => {
      expect(ids(await tx`select id from payouts`)).toEqual([PAYOUT_P]);
    });
  });

  it('the PAYER (owner A) reads ZERO payouts', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(await tx`select id from payouts`).toHaveLength(0);
    });
  });

  it('Q staff read ONLY Q\'s payout (no cross-leak)', async () => {
    await asApp(SQ.profileId, async (tx) => {
      expect(ids(await tx`select id from payouts`)).toEqual([PAYOUT_Q]);
    });
  });

  it('a P admin can INSERT a payout; a non-admin staff cannot', async () => {
    await asApp(SOWN.profileId, (tx) => tx`
      insert into payouts (provider_id, rail, amount_cents, status)
      values (${P}, 'binance', 1000, 'pending')
    `);
    await expect(
      asApp(SSTF.profileId, (tx) => tx`
        insert into payouts (provider_id, rail, amount_cents, status)
        values (${P}, 'binance', 1000, 'pending')
      `),
    ).rejects.toThrow(/row-level security/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. subscriptions — owner own + provider staff read.
describe('RLS 2.3 — subscriptions (owner own + provider-staff read)', () => {
  it('owner A reads their subscription; B reads ZERO', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(ids(await tx`select id from subscriptions`)).toEqual([SUB_A]);
    });
    await asApp(B.profileId, async (tx) => {
      expect(await tx`select id from subscriptions`).toHaveLength(0);
    });
  });

  it('P active staff read A\'s subscription to P', async () => {
    await asApp(SSTF.profileId, async (tx) => {
      expect(ids(await tx`select id from subscriptions`)).toEqual([SUB_A]);
    });
  });

  it('Q staff read ZERO (no cross-leak)', async () => {
    await asApp(SQ.profileId, async (tx) => {
      expect(await tx`select id from subscriptions`).toHaveLength(0);
    });
  });
});
