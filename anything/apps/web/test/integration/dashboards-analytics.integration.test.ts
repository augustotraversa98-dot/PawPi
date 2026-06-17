// Dashboards & analytics (ticket 2.14) — proven on the REAL tables acting AS pawpi_app. The
// 2.14 analytics endpoint (/api/providers/[id]/analytics) and owner-hub endpoint
// (/api/me/bookings) introduce NO new tables — they are read-only aggregates over the EXISTING
// RLS-scoped tables (orders 2.3, vet_appointments 2.4, daycare_stays 2.8, provider_reviews 2.2,
// provider_services). So there is no new RLS policy / completeness-guard surface to prove. What
// MUST be proven is the ticket's hard constraint: the aggregates NEVER cross a provider/owner
// boundary. This suite re-runs the endpoints' own aggregate SQL AS pawpi_app under each
// identity and asserts each principal sees ONLY their own rows.
//
// Pattern mirrors the sibling RLS suites: a porsager client AS pawpi_app (NOBYPASSRLS) with
// app.current_user_id set per transaction; allowed-vs-ZERO. The harness owner is superuser, so
// FORCE RLS constrains only pawpi_app.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  makeTestSql,
  resetDb,
  seedOwnerWithPet,
  seedUser,
  seedProvider,
  seedStaff,
  seedCapability,
  seedService,
  seedOrder,
  seedReview,
  seedBooking,
  seedDaycareStay,
  seedGrant,
} from './db';

// Identities.
const O = { authUserId: 1, profileId: 1, username: 'owner', petId: 1, petName: 'Rex' }; // booked with P
const B = { authUserId: 2, profileId: 2, username: 'otherowner', petId: 2, petName: 'Fido' }; // booked with Q
const POWN = { authUserId: 3, profileId: 3, username: 'pown' }; // provider P owner/staff
const QOWN = { authUserId: 4, profileId: 4, username: 'qown' }; // provider Q owner/staff
const X = { authUserId: 5, profileId: 5, username: 'outsider' }; // authed non-staff outsider

const P = 10; // provider P
const Q = 20; // provider Q (the cross-leak control)

const SVC_P = 100; // P's service
const SVC_Q = 200; // Q's service

// P's data.
const ORDER_P1 = 500; // P paid order
const ORDER_P2 = 501; // P paid order
const ORDER_P_PENDING = 502; // P pending (excluded from revenue)
const APPT_P = 600; // P booking (with service)
const STAY_P = 700; // P daycare stay (checked_in) — needs a grant to be visible to P
const REVIEW_P = 800; // P review

// Q's data (must never appear in P's aggregates).
const ORDER_Q1 = 510;
const APPT_Q = 610;
const REVIEW_Q = 810;

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
  await seedOwnerWithPet(raw, O);
  await seedOwnerWithPet(raw, B);
  await seedUser(raw, POWN);
  await seedUser(raw, QOWN);
  await seedUser(raw, X);

  // Two published providers, each with one active owner-staff + a service + daycare capability.
  await seedProvider(raw, { providerId: P, ownerUserProfileId: POWN.profileId, slug: 'p', status: 'published' });
  await seedStaff(raw, { providerId: P, userProfileId: POWN.profileId, role: 'owner', status: 'active' });
  await seedCapability(raw, { providerId: P, capability: 'daycare' });
  await seedService(raw, { serviceId: SVC_P, providerId: P, name: 'P Grooming' });

  await seedProvider(raw, { providerId: Q, ownerUserProfileId: QOWN.profileId, slug: 'q', status: 'published' });
  await seedStaff(raw, { providerId: Q, userProfileId: QOWN.profileId, role: 'owner', status: 'active' });
  await seedCapability(raw, { providerId: Q, capability: 'daycare' });
  await seedService(raw, { serviceId: SVC_Q, providerId: Q, name: 'Q Grooming' });

  // P revenue: two paid orders + one pending (excluded). Q: one paid order.
  await seedOrder(raw, { orderId: ORDER_P1, ownerUserId: O.profileId, providerId: P, kind: 'product', amountCents: 10000, status: 'paid' });
  await seedOrder(raw, { orderId: ORDER_P2, ownerUserId: O.profileId, providerId: P, kind: 'booking', amountCents: 5000, status: 'paid' });
  await seedOrder(raw, { orderId: ORDER_P_PENDING, ownerUserId: O.profileId, providerId: P, kind: 'product', amountCents: 9999, status: 'pending' });
  await seedOrder(raw, { orderId: ORDER_Q1, ownerUserId: B.profileId, providerId: Q, kind: 'product', amountCents: 7000, status: 'paid' });

  // Bookings (vet_appointments). Give P's booking a service for top-services.
  await seedBooking(raw, { apptId: APPT_P, petId: O.petId, ownerUserId: O.profileId, providerId: P });
  await raw`update vet_appointments set service_id = ${SVC_P} where id = ${APPT_P}`;
  await seedBooking(raw, { apptId: APPT_Q, petId: B.petId, ownerUserId: B.profileId, providerId: Q });
  await raw`update vet_appointments set service_id = ${SVC_Q} where id = ${APPT_Q}`;

  // Daycare stay for P (checked_in) — daycare_stays RLS shows a provider row only through a
  // grant, so seed the grant the facility needs to see the stay.
  await seedGrant(raw, { petId: O.petId, ownerUserId: O.profileId, providerId: P, scopes: ['health_logs_write'], status: 'active' });
  await seedDaycareStay(raw, { stayId: STAY_P, petId: O.petId, ownerUserId: O.profileId, providerId: P, status: 'checked_in' });

  // Reviews.
  await seedReview(raw, { reviewId: REVIEW_P, providerId: P, ownerUserId: O.profileId, petId: O.petId, rating: 4 });
  await seedReview(raw, { reviewId: REVIEW_Q, providerId: Q, ownerUserId: B.profileId, petId: B.petId, rating: 5 });
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. Provider analytics — each provider's staff sees ONLY their own aggregates.
describe('2.14 — provider analytics aggregates are provider-scoped (no cross-leak)', () => {
  it("P's staff revenue sums ONLY P's paid orders (excludes pending + Q)", async () => {
    const rows = await asApp(POWN.profileId, (tx) => tx`
      select coalesce(sum(amount_cents),0)::bigint as total, count(*)::int as n
      from orders where provider_id = ${P} and status = 'paid'
    `);
    expect(Number(rows[0].total)).toBe(15000); // 10000 + 5000, NOT the 9999 pending
    expect(rows[0].n).toBe(2);
  });

  it("P's staff querying Q's revenue gets ZERO (cross-provider read denied by RLS)", async () => {
    const rows = await asApp(POWN.profileId, (tx) => tx`
      select coalesce(sum(amount_cents),0)::bigint as total, count(*)::int as n
      from orders where provider_id = ${Q} and status = 'paid'
    `);
    expect(Number(rows[0].total)).toBe(0);
    expect(rows[0].n).toBe(0);
  });

  it("P's staff bookings count ONLY P's appointments", async () => {
    const rows = await asApp(POWN.profileId, (tx) => tx`
      select count(*)::int as n from vet_appointments
      where provider_id = ${P} and deleted_at is null
    `);
    expect(rows[0].n).toBe(1);
    const qSeen = await asApp(POWN.profileId, (tx) => tx`
      select count(*)::int as n from vet_appointments
      where provider_id = ${Q} and deleted_at is null
    `);
    expect(qSeen[0].n).toBe(0);
  });

  it("P's staff occupancy + rating + top-services read ONLY P's rows", async () => {
    const occ = await asApp(POWN.profileId, (tx) => tx`
      select count(*) filter (where status = 'checked_in')::int as on_site
      from daycare_stays where provider_id = ${P}
    `);
    expect(occ[0].on_site).toBe(1);

    const rating = await asApp(POWN.profileId, (tx) => tx`
      select count(*)::int as n, coalesce(round(avg(rating)::numeric,2),0) as avg
      from provider_reviews where provider_id = ${P}
    `);
    expect(rating[0].n).toBe(1);
    expect(Number(rating[0].avg)).toBe(4);

    const top = await asApp(POWN.profileId, (tx) => tx`
      select s.id as service_id, count(va.id)::int as n
      from vet_appointments va
      join provider_services s on s.id = va.service_id
      where va.provider_id = ${P} and va.deleted_at is null
      group by s.id
    `);
    expect(top.map((r: any) => r.service_id)).toEqual([SVC_P]);
    expect(top[0].n).toBe(1);
  });

  it("Q's staff sees Q's revenue, NOT P's", async () => {
    const qOwn = await asApp(QOWN.profileId, (tx) => tx`
      select coalesce(sum(amount_cents),0)::bigint as total from orders
      where provider_id = ${Q} and status = 'paid'
    `);
    expect(Number(qOwn[0].total)).toBe(7000);
    const pSeen = await asApp(QOWN.profileId, (tx) => tx`
      select coalesce(sum(amount_cents),0)::bigint as total from orders
      where provider_id = ${P} and status = 'paid'
    `);
    expect(Number(pSeen[0].total)).toBe(0);
  });

  it('a non-staff outsider sees ZERO for either provider', async () => {
    const seen = await asApp(X.profileId, (tx) => tx`
      select
        (select count(*)::int from orders where provider_id = ${P} and status = 'paid') as p_orders,
        (select count(*)::int from vet_appointments where provider_id = ${P}) as p_bookings,
        (select count(*)::int from provider_reviews where provider_id = ${P}) as p_reviews
    `);
    // reviews are public-ish (anyone can read a published provider's reviews), so reviews may be
    // visible; revenue + bookings are staff-only and MUST be zero for an outsider.
    expect(seen[0].p_orders).toBe(0);
    expect(seen[0].p_bookings).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Owner hub — /api/me/bookings reads ONLY the owner's own bookings across all providers.
describe('2.14 — owner hub my-bookings is owner-scoped (no cross-owner leak)', () => {
  it("O sees O's booking (with P), NOT B's booking (with Q)", async () => {
    const rows = await asApp(O.profileId, (tx) => tx`
      select id, provider_id from vet_appointments
      where owner_user_id = ${O.profileId} and deleted_at is null
    `);
    expect(rows.map((r: any) => r.id)).toEqual([APPT_P]);
    const bSeen = await asApp(O.profileId, (tx) => tx`
      select count(*)::int as n from vet_appointments where owner_user_id = ${B.profileId}
    `);
    expect(bSeen[0].n).toBe(0);
  });

  it("B sees B's booking, NOT O's", async () => {
    const rows = await asApp(B.profileId, (tx) => tx`
      select id from vet_appointments
      where owner_user_id = ${B.profileId} and deleted_at is null
    `);
    expect(rows.map((r: any) => r.id)).toEqual([APPT_Q]);
  });
});
